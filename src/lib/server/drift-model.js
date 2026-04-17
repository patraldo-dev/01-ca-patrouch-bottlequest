/**
 * Current Zone Drift Model (Simple Mode)
 * Uses predefined ocean current zones from D1 to simulate bottle drift.
 * Each zone has base u/v vectors + seasonal amplitude + noise.
 * 
 * Later: "Scientific mode" will use HYCOM/Copernicus real data.
 */

/**
 * Find which current zone(s) affect a position
 * Returns the zone with strongest current, or open-ocean fallback
 */
function findZone(zones, lat, lon) {
    let best = null;
    let bestScore = 0;

    for (const zone of zones) {
        if (lat >= zone.min_lat && lat <= zone.max_lat && lon >= zone.min_lon && lon <= zone.max_lon) {
            // Score based on current speed (stronger = more dominant)
            const speed = Math.sqrt(zone.base_u ** 2 + zone.base_v ** 2);
            const score = speed + (1 / (1 + (zone.max_lat - zone.min_lat) * (zone.max_lon - zone.min_lon)));
            if (score > bestScore) {
                bestScore = score;
                best = zone;
            }
        }
    }

    return best; // null = open ocean
}

/**
 * Calculate drift for a bottle given its zone and time of year
 * Returns { deltaLat, deltaLon, speedKmh, heading } for a 6-hour period
 */
function calculateDrift(zone, month) {
    // Seasonal factor: sin curve based on month (1-12)
    // Peaks around month 7 (July), trough at month 1 (January)
    const seasonalPhase = Math.sin((month - 1) * Math.PI / 6);

    // u = eastward (m/s), v = northward (m/s)
    const u = (zone.base_u + zone.seasonal_u_amp * seasonalPhase);
    const v = (zone.base_v + zone.seasonal_v_amp * seasonalPhase);

    // Add noise (stochastic component)
    const noise = zone.noise_factor || 0.3;
    const randU = (Math.random() - 0.5) * 2 * noise * Math.abs(u || 0.1);
    const randV = (Math.random() - 0.5) * 2 * noise * Math.abs(v || 0.1);

    const totalU = u + randU;
    const totalV = v + randV;

    const speed = Math.sqrt(totalU ** 2 + totalV ** 2); // m/s
    const heading = Math.atan2(totalU, totalV) * (180 / Math.PI); // degrees from north

    // 6-hour drift
    const HOURS = 6;
    const DT = HOURS * 3600; // seconds

    // Convert displacement to degrees
    const deltaLat = totalV * DT / 111320; // meters to degrees lat
    const deltaLon = totalU * DT / (111320 * Math.cos(20 * Math.PI / 180)); // approx for PV latitude

    return {
        deltaLat,
        deltaLon,
        speedKmh: speed * 3.6,
        speedMs: speed,
        heading,
        u: totalU,
        v: totalV,
        zone: zone.name
    };
}

/**
 * Run drift simulation for all active bottles
 * Called by POST /api/drift/simulate
 */
export async function simulateDrift(db, mode = 'simple') {
    // Load current zones
    const { results: zones } = await db.prepare(`
        SELECT * FROM current_zones WHERE mode = ? OR mode = 'both'
    `).bind(mode).all();

    if (!zones || zones.length === 0) {
        throw new Error('No current zones found');
    }

    // Always include open-ocean as fallback
    const openOcean = zones.find(z => z.id === 'open-ocean');

    // Get active bottles
    const { results: bottles } = await db.prepare(`
        SELECT id, current_lat, current_lon, distance_km FROM bottles
        WHERE status IN ('launched', 'sailing')
        AND current_lat IS NOT NULL AND current_lon IS NOT NULL
    `).all();

    if (!bottles || bottles.length === 0) {
        return { message: 'No active bottles', updated: 0 };
    }

    const month = new Date().getMonth() + 1;
    const updated = [];

    for (const bottle of bottles) {
        const zone = findZone(zones, bottle.current_lat, bottle.current_lon) || openOcean;

        if (!zone) continue;

        const drift = calculateDrift(zone, month);
        const newLat = bottle.current_lat + drift.deltaLat;
        const newLon = bottle.current_lon + drift.deltaLon;
        const distKm = drift.speedMs * 6 * 3600 / 1000;

        // Beach detection
        const beached = checkBeach(newLat, newLon);
        const newStatus = beached ? 'beached' : 'sailing';

        // Update bottle
        await db.prepare(`
            UPDATE bottles SET
                current_lat = ?, current_lon = ?,
                distance_km = ?,
                status = COALESCE(?, status),
                updated_at = datetime('now')
            WHERE id = ?
        `).bind(newLat, newLon, (bottle.distance_km || 0) + distKm, newStatus, bottle.id).run();

        // Save position
        await db.prepare(`
            INSERT INTO bottle_positions (id, bottle_id, lat, lon, recorded_at)
            VALUES (?, ?, ?, ?, datetime('now'))
        `).bind(crypto.randomUUID(), bottle.id, newLat, newLon).run();

        // Save drift event
        await db.prepare(`
            INSERT INTO ocean_drift_events (id, bottle_id, old_lat, old_lon, new_lat, new_lon, current_u, current_v, speed_kmh, distance_km, data_source)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).bind(
            crypto.randomUUID(), bottle.id,
            bottle.current_lat, bottle.current_lon,
            newLat, newLon,
            drift.u, drift.v, drift.speedKmh, distKm, zone.name
        ).run();

        // Log beach event
        if (beached) {
            await db.prepare(`
                INSERT INTO bottle_events (id, bottle_id, event_type, lat, lon, description)
                VALUES (?, ?, 'beached', ?, ?, ?)
            `).bind(crypto.randomUUID(), bottle.id, newLat, newLon,
                `Bottle beached in ${zone.name} zone after ${(bottle.distance_km || 0) + distKm} km`
            ).run();
        }

        updated.push({
            id: bottle.id,
            zone: drift.zone,
            drift_km: distKm.toFixed(2),
            speed_kmh: drift.speedKmh.toFixed(2),
            heading: drift.heading.toFixed(0),
            lat: newLat.toFixed(4),
            lon: newLon.toFixed(4),
            beached: !!beached
        });
    }

    return {
        message: `Updated ${updated.length} bottles via ${mode} mode`,
        mode,
        month,
        updated,
        simulated_at: new Date().toISOString()
    };
}

function checkBeach(lat, lon) {
    // Baja California Peninsula
    if (lat > 22.5 && lat < 33 && lon > -118 && lon < -109) return 'Baja California';
    // Mainland Mexico coast
    if (lat > 14 && lat < 22.5 && lon > -106 && lon < -97) return 'Mainland Mexico';
    // Central America
    if (lat > 7 && lat < 14 && lon > -92 && lon < -77) return 'Central America';
    // Colombia coast
    if (lat > 2 && lat < 12 && lon > -79 && lon < -67) return 'Colombia';
    // Ecuador coast
    if (lat > -5 && lat < 2 && lon > -82 && lon < -75) return 'Ecuador';
    // Peru coast
    if (lat > -18 && lat < -5 && lon > -82 && lon < -69) return 'Peru';
    // Chile coast
    if (lat > -30 && lat < -18 && lon > -75 && lon < -68) return 'Chile';
    // Galapagos
    if (lat > -1.5 && lat < 1.5 && lon > -92 && lon < -89) return 'Galapagos';
    // Hawaii
    if (lat > 18 && lat < 23 && lon > -161 && lon < -154) return 'Hawaii';
    // Clipperton Island
    if (lat > 10 && lat < 11.5 && lon > -109.5 && lon < -109) return 'Clipperton Island';
    // Revillagigedo
    if (lat > 17.5 && lat < 20 && lon > -116 && lon < -109) return 'Revillagigedo';
    return null;
}
