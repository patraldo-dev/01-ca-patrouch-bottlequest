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

        // Update market data (Brent + Fed rate)
        await updateMarketData(db);

        return new Response(JSON.stringify(result), {
            headers: { 'Content-Type': 'application/json' }
        });
    } catch (e) {
        console.error('Drift simulation error:', e);
        return new Response(JSON.stringify({ error: e.message }), { status: 500 });
    }
}

async function updateMarketData(db) {
    try {
        // Fetch Brent crude price from EIA (free, no key)
        let brent = 73.0;
        let brentChange = 0;
        try {
            const brentRes = await fetch('https://api.eia.gov/v2/petroleum/spot/pri/data/?api_key=DEMO_KEY&frequency=daily&data[0]=value&facets[series_id][]=EER_EPD2F_PF4_R_MBBLD&sort[0][column]=period&sort[0][direction]=desc&offset=0&length=2', {
                headers: { 'Accept': 'application/json' }
            });
            if (brentRes.ok) {
                const brentData = await brentRes.json();
                const vals = brentData?.response?.data;
                if (vals?.length >= 1) {
                    brent = parseFloat(vals[0].value) || 73.0;
                    if (vals.length >= 2) {
                        brentChange = brent - (parseFloat(vals[1].value) || brent);
                    }
                }
            }
        } catch (e) {
            console.error('Brent fetch error:', e.message);
        }

        // Fetch Fed Funds Rate from FRED (free CSV)
        let fedRate = 5.25;
        let fedChange = 0;
        try {
            const fredRes = await fetch('https://fred.stlouisfed.org/graph/fredgraph.csv?id=FEDFUNDS');
            if (fredRes.ok) {
                const csv = await fredRes.text();
                const lines = csv.trim().split('\n');
                // CSV: DATE,VALUE — last 2 rows
                if (lines.length >= 3) {
                    const latest = parseFloat(lines[lines.length - 1].split(',')[1]);
                    const prev = parseFloat(lines[lines.length - 2].split(',')[1]);
                    if (!isNaN(latest)) fedRate = latest;
                    if (!isNaN(prev)) fedChange = latest - prev;
                }
            }
        } catch (e) {
            console.error('Fed rate fetch error:', e.message);
        }

        // Calculate cost per km (Brent / 100)
        const costPerKm = Math.round(brent / 100 * 100) / 100;

        // Store
        await db.prepare(`
            UPDATE bq_market SET
                brent_price = ?, fed_rate = ?, cost_per_km = ?,
                brent_change = ?, fed_change = ?, updated_at = datetime('now')
            WHERE id = 'daily'
        `).bind(brent, fedRate, costPerKm, brentChange, fedChange).run();

        console.log(`Market updated: Brent=$${brent} (${brentChange > 0 ? '+' : ''}${brentChange.toFixed(2)}), Fed=${fedRate}% (${fedChange > 0 ? '+' : ''}${fedChange.toFixed(2)}%), Cost=${costPerKm}/km`);
    } catch (e) {
        console.error('Market update error:', e.message);
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
