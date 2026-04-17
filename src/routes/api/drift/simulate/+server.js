import { getCurrentsBatch } from '$lib/server/ocean-currents';

/**
 * POST /api/drift/simulate
 * Fetches real ocean currents for active bottles and updates their positions
 * Called by cron every 6-12 hours
 */
export async function POST({ request, platform }) {
    const db = platform?.env?.DB;
    if (!db) {
        return new Response(JSON.stringify({ error: 'No DB' }), { status: 500 });
    }

    try {
        // Get all active (launched/sailing) bottles
        const { results: bottles } = await db.prepare(`
            SELECT id, current_lat, current_lon FROM bottles
            WHERE status IN ('launched', 'sailing')
            AND current_lat IS NOT NULL AND current_lon IS NOT NULL
        `).all();

        if (!bottles || bottles.length === 0) {
            return new Response(JSON.stringify({ message: 'No active bottles', updated: 0 }));
        }

        // Fetch real currents for each bottle position
        const points = bottles.map(b => ({ bottle_id: b.id, lat: b.current_lat, lon: b.current_lon }));
        const currents = await getCurrentsBatch(points);

        const updated = [];
        const HOURS = 6; // drift period
        const DT = HOURS * 3600; // seconds

        for (let i = 0; i < bottles.length; i++) {
            const bottle = bottles[i];
            const current = currents[i];

            if (!current || current.speed === 0) {
                // No current data — use minimal random drift
                const driftLat = (Math.random() - 0.5) * 0.01;
                const driftLon = (Math.random() - 0.5) * 0.01;
                const newLat = bottle.current_lat + driftLat;
                const newLon = bottle.current_lon + driftLon;

                await updateBottlePosition(db, bottle, newLat, newLon, 0, 0, 0, HOURS, 'fallback_random');
                updated.push({ id: bottle.id, drift_km: 0 });
                continue;
            }

            // Calculate new position using current vectors
            // u = eastward (m/s), v = northward (m/s)
            // Convert displacement to degrees
            const deltaLat = current.v * DT / 111320; // meters to degrees latitude
            const deltaLon = current.u * DT / (111320 * Math.cos(bottle.current_lat * Math.PI / 180));

            const newLat = bottle.current_lat + deltaLat;
            const newLon = bottle.current_lon + deltaLon;
            const distanceKm = current.speed * DT / 1000;

            // Check beach detection
            const beached = await checkBeach(db, newLat, newLon);
            const newStatus = beached ? 'beached' : 'sailing';

            await updateBottlePosition(db, bottle, newLat, newLon, current.u, current.v, distanceKm, HOURS, current.source, newStatus);

            updated.push({
                id: bottle.id,
                drift_km: distanceKm.toFixed(2),
                speed_ms: current.speed.toFixed(3),
                beached: !!beached
            });

            // Log event
            if (beached) {
                await db.prepare(`
                    INSERT INTO bottle_events (id, bottle_id, event_type, lat, lon, description)
                    VALUES (?, ?, 'beached', ?, ?, ?)
                `).bind(
                    crypto.randomUUID(), bottle.id, newLat, newLon,
                    `Bottle beached after ${distanceKm.toFixed(1)} km drift`
                ).run();
            }
        }

        return new Response(JSON.stringify({
            message: `Updated ${updated.length} bottles`,
            updated,
            simulated_at: new Date().toISOString()
        }));
    } catch (e) {
        console.error('Drift simulation error:', e);
        return new Response(JSON.stringify({ error: e.message }), { status: 500 });
    }
}

async function updateBottlePosition(db, bottle, newLat, newLon, u, v, distanceKm, hours, source, status = null) {
    const id = crypto.randomUUID();

    // Update current position
    const setStatus = status ? `, status = '${status}'` : '';
    await db.prepare(`
        UPDATE bottles SET
            current_lat = ?,
            current_lon = ?,
            distance_km = COALESCE(distance_km, 0) + ?,
            updated_at = datetime('now')
            ${setStatus}
        WHERE id = ?
    `).bind(newLat, newLon, distanceKm, bottle.id).run();

    // Record position history
    await db.prepare(`
        INSERT INTO bottle_positions (id, bottle_id, lat, lon, recorded_at)
        VALUES (?, ?, ?, ?, datetime('now'))
    `).bind(id, bottle.id, newLat, newLon).run();

    // Record drift event
    await db.prepare(`
        INSERT INTO ocean_drift_events (id, bottle_id, old_lat, old_lon, new_lat, new_lon, current_u, current_v, speed_kmh, distance_km, data_source)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
        crypto.randomUUID(), bottle.id,
        bottle.current_lat, bottle.current_lon,
        newLat, newLon,
        u, v,
        distanceKm > 0 ? (distanceKm / (hours * 3600) * 1000) : 0,
        distanceKm, source
    ).run();
}

async function checkBeach(db, lat, lon) {
    // Simple bounding box beach detection
    // Baja California Peninsula
    if (lat > 22 && lat < 33 && lon > -118 && lon < -109) return true;
    // Mainland Mexico (south of PV)
    if (lat > 14 && lat < 21 && lon > -106 && lon < -92) return true;
    // Central America
    if (lat > 7 && lat < 14 && lon > -92 && lon < -77) return true;
    // Colombia/Ecuador coast
    if (lat > -5 && lat < 8 && lon > -82 && lon < -67) return true;
    // Peru coast
    if (lat > -18 && lat < -5 && lon > -82 && lon < -69) return true;
    // Hawaii
    if (lat > 18 && lat < 23 && lon > -161 && lon < -154) return true;

    return false;
}
