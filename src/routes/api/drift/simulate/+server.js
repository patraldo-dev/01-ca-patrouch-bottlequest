import { simulateDrift } from '$lib/server/drift-model';

/**
 * POST /api/drift/simulate
 * Run drift simulation for all active bottles
 * Body: { mode?: 'simple' | 'scientific' } (default: simple)
 */
export async function POST({ request, platform }) {
    const db = platform?.env?.DB;
    if (!db) {
        return new Response(JSON.stringify({ error: 'No DB' }), { status: 500 });
    }

    try {
        let mode = 'simple';
        try {
            const body = await request.json();
            if (body.mode) mode = body.mode;
        } catch {}

        const result = await simulateDrift(db, mode);
        return new Response(JSON.stringify(result), {
            headers: { 'Content-Type': 'application/json' }
        });
    } catch (e) {
        console.error('Drift simulation error:', e);
        return new Response(JSON.stringify({ error: e.message }), { status: 500 });
    }
}

/**
 * GET /api/drift/simulate
 * Returns current zone info for a given lat/lon
 */
export async function GET({ url, platform }) {
    const db = platform?.env?.DB;
    const lat = parseFloat(url.searchParams.get('lat'));
    const lon = parseFloat(url.searchParams.get('lon'));

    if (isNaN(lat) || isNaN(lon)) {
        return new Response(JSON.stringify({ error: 'lat and lon required' }), { status: 400 });
    }

    const { results: zones } = await db.prepare(`
        SELECT * FROM current_zones
    `).all();

    const active = zones?.filter(z =>
        lat >= z.min_lat && lat <= z.max_lat && lon >= z.min_lon && lon <= z.max_lon
    ) || [];

    return new Response(JSON.stringify({ lat, lon, zones: active }), {
        headers: { 'Content-Type': 'application/json' }
    });
}
// trigger rebuild
