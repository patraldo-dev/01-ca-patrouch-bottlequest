/**
 * Current Zone Drift Model (Simple Mode v2)
 * - Launch from center of Bay of Banderas
 * - Beach buffer: 15km from coast before beaching
 * - Coastal currents run parallel to shore
 * - Open ocean drifts with real current patterns
 */

/**
 * Find which current zone(s) affect a position
 * Returns array of matching zones (multiple zones can overlap)
 */
function findZones(zones, lat, lon) {
    return zones.filter(z =>
        lat >= z.min_lat && lat <= z.max_lat &&
        lon >= z.min_lon && lon <= z.max_lon
    );
}

/**
 * Calculate drift for a bottle given its zones and month
 * Returns { deltaLat, deltaLon, speedKmh, heading, zone } for a 6-hour period
 */
function calculateDrift(zones, month) {
    // Use the first matching zone (priority by speed)
    let zone = zones[0] || zones.find(z => z.id === 'open-ocean');
    if (!zone) return null;

    const seasonalPhase = Math.sin((month - 1) * Math.PI / 6);
    const u = (zone.base_u + zone.seasonal_u_amp * seasonalPhase);
    const v = (zone.base_v + zone.seasonal_v_amp * seasonalPhase);

    const noise = zone.noise_factor || 0.3;
    const baseSpeed = Math.sqrt(u ** 2 + v ** 2) || 0.05;
    const randU = (Math.random() - 0.5) * 2 * noise * baseSpeed;
    const randV = (Math.random() - 0.5) * 2 * noise * baseSpeed;

    const totalU = u + randU;
    const totalV = v + randV;
    const speed = Math.sqrt(totalU ** 2 + totalV ** 2);
    const heading = Math.atan2(totalU, totalV) * (180 / Math.PI);

    const HOURS = 6;
    const DT = HOURS * 3600;
    const deltaLat = totalV * DT / 111320;
    const deltaLon = totalU * DT / (111320 * Math.cos(lat2rad(Math.abs(zone.base_lat || 15))));

    return { deltaLat, deltaLon, speedKmh: speed * 3.6, speedMs: speed, heading, u: totalU, v: totalV, zone: zone.name };
}

function lat2rad(lat) { return lat * Math.PI / 180; }

/**
 * Check distance to nearest coast (simplified polygon boundaries)
 * Returns { beached: bool, coast: string, distanceKm: number }
 */
function checkCoast(lat, lon) {
    const coasts = [
        // [name, lat, lon, threshold_km]
        // Bay of Banderas surrounds
        ['Punta Mita', 20.71, -105.54, 0.3],
        ['Nuevo Vallarta', 20.72, -105.29, 0.2],
        ['Puerto Vallarta Malecon', 20.65, -105.23, 0.15],
        ['Cabo Corrientes', 19.53, -105.22, 0.3],
        ['Yelapa', 20.47, -105.40, 0.2],
        ['Boca de Tomatlan', 20.50, -105.36, 0.2],
        // Rest of Pacific coast
        ['Baja California North', 28, -114, 0.8],
        ['Baja California South', 24, -110, 1.0],
        ['Baja California Tip', 23, -110, 0.8],
        ['Baja Pacific Side', 28, -115.5, 1.2],
        ['Nayarit Coast', 21.5, -105.2, 0.5],
        ['Jalisco Coast', 19.5, -105.0, 0.5],
        ['Colima Coast', 19.1, -104.5, 0.5],
        ['Michoacán Coast', 18.0, -103.5, 0.6],
        ['Guerrero Coast', 16.5, -99.5, 0.6],
        ['Oaxaca Coast', 15.5, -96.0, 0.6],
        ['Chiapas Coast', 15.0, -93.0, 0.6],
        ['Central America South', 9.0, -80, 1.0],
        ['Colombia Pacific', 4.0, -77.5, 0.8],
        ['Ecuador Coast', -1.5, -80.0, 0.8],
        ['Peru Coast', -10, -78, 1.0],
        ['Chile Coast', -25, -71, 1.0],
        ['Hawaii', 20.8, -156.5, 0.5],
        ['Galapagos', -0.7, -90.5, 0.3],
        ['Clipperton', 10.3, -109.2, 0.2],
        ['Revillagigedo', 18.7, -112, 0.5],
    ];

    let closest = null;
    let minDist = Infinity;

    for (const [name, clat, clon, threshold] of coasts) {
        const d = haversine(lat, lon, clat, clon);
        // Scale threshold by latitude (degrees shrink at poles)
        const scaledThreshold = threshold / Math.cos(lat2rad(Math.abs(clat)));
        if (d < scaledThreshold * 15 && d < minDist) { // 15x = beach buffer in km
            minDist = d;
            closest = { name, distanceKm: d, thresholdKm: scaledThreshold * 15 };
        }
    }

    if (closest && minDist < closest.thresholdKm) {
        return { beached: false, coast: closest.name, distanceKm: minDist, approaching: true };
    }

    return { beached: false, coast: null, distanceKm: minDist, approaching: false };
}

function haversine(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const dLat = lat2rad(lat2 - lat1);
    const dLon = lat2rad(lon2 - lon1);
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat2rad(lat1)) * Math.cos(lat2rad(lat2)) * Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Run drift simulation for all active bottles
 */
export async function simulateDrift(db, mode = 'simple') {
    const { results: zones } = await db.prepare(`
        SELECT * FROM current_zones WHERE mode = ? OR mode = 'both'
    `).bind(mode).all();

    if (!zones || zones.length === 0) throw new Error('No current zones found');
    const openOcean = zones.find(z => z.id === 'open-ocean');

    const { results: bottles } = await db.prepare(`
        SELECT id, current_lat, current_lon, distance_km, created_at
        FROM bottles WHERE status IN ('launched', 'sailing')
        AND current_lat IS NOT NULL AND current_lon IS NOT NULL
    `).all();

    if (!bottles || bottles.length === 0) {
        return { message: 'No active bottles', updated: 0 };
    }

    const month = new Date().getMonth() + 1;
    const updated = [];

    for (const bottle of bottles) {
        const matching = findZones(zones, bottle.current_lat, bottle.current_lon);
        const activeZones = matching.length > 0 ? matching : (openOcean ? [openOcean] : []);
        if (activeZones.length === 0) continue;

        const drift = calculateDrift(activeZones, month);
        if (!drift) continue;

        let newLat = bottle.current_lat + drift.deltaLat;
        let newLon = bottle.current_lon + drift.deltaLon;
        const distKm = drift.speedMs * 6 * 3600 / 1000;

        // Coast check
        const coast = checkCoast(newLat, newLon);
        let newStatus = 'sailing';
        let beached = false;

        // Only beach if actually very close (< 5km) and been drifting > 12h
        const hoursDrifting = (Date.now() - new Date(bottle.created_at).getTime()) / 3600000;
        if (coast.beached && coast.distanceKm < 5 && hoursDrifting > 12) {
            newStatus = 'beached';
            beached = true;
        }
        // If approaching coast, add slight deflection parallel to shore
        else if (coast.approaching && coast.distanceKm < 20) {
            // Nudge away from coast slightly
            newLat += (Math.random() - 0.5) * 0.02;
            newLon += (Math.random() - 0.5) * 0.02;
        }

        // Clamp to valid ocean range
        newLat = Math.max(-60, Math.min(60, newLat));
        newLon = Math.max(-180, Math.min(-100, newLon)); // Eastern Pacific only

        await db.prepare(`
            UPDATE bottles SET current_lat = ?, current_lon = ?,
            distance_km = ?, status = COALESCE(?, status),
            updated_at = datetime('now') WHERE id = ?
        `).bind(newLat, newLon, (bottle.distance_km || 0) + distKm, newStatus, bottle.id).run();

        await db.prepare(`
            INSERT INTO bottle_positions (id, bottle_id, lat, lon, recorded_at)
            VALUES (?, ?, ?, ?, datetime('now'))
        `).bind(crypto.randomUUID(), bottle.id, newLat, newLon).run();

        await db.prepare(`
            INSERT INTO ocean_drift_events (id, bottle_id, old_lat, old_lon, new_lat, new_lon,
            current_u, current_v, speed_kmh, distance_km, data_source)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).bind(crypto.randomUUID(), bottle.id,
            bottle.current_lat, bottle.current_lon, newLat, newLon,
            drift.u, drift.v, drift.speedKmh, distKm, drift.zone).run();

        if (beached) {
            await db.prepare(`
                INSERT INTO bottle_events (id, bottle_id, event_type, lat, lon, description)
                VALUES (?, ?, 'beached', ?, ?, ?)
            `).bind(crypto.randomUUID(), bottle.id, newLat, newLon,
                `Bottle beached near ${coast.coast} after ${(bottle.distance_km || 0) + distKm} km`).run();
        }

        updated.push({
            id: bottle.id, zone: drift.zone,
            drift_km: distKm.toFixed(2), speed_kmh: drift.speedKmh.toFixed(2),
            heading: drift.heading.toFixed(0),
            lat: newLat.toFixed(4), lon: newLon.toFixed(4),
            beached, coast: coast.coast, coast_dist: coast.distanceKm?.toFixed(1)
        });
    }

    return {
        message: `Updated ${updated.length} bottles via ${mode} mode`,
        mode, month, updated,
        simulated_at: new Date().toISOString()
    };
}
