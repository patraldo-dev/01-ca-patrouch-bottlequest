export async function load({ platform }) {
    const db = platform?.env?.DB;
    let bottles = [];
    let players = [];
    let playersInPursuit = 0;

    if (!db) {
        console.error('No DB binding');
        return { bottles, players };
    }

    // Bottles
    try {
        const { results } = await db.prepare(`
            SELECT b.*, u.display_name as author_name FROM bottles b
            LEFT JOIN users u ON b.user_id = u.id
            WHERE b.status IN ('launched', 'sailing', 'beached', 'found')
            ORDER BY b.created_at DESC
        `).all();
        bottles = results || [];

        for (const bottle of bottles) {
            const pos = await db.prepare(`
                SELECT lat, lon, recorded_at FROM bottle_positions WHERE bottle_id = ? ORDER BY recorded_at ASC
            `).bind(bottle.id).all();
            bottle.positions = pos.results || [];
        }
    } catch (e) {
        console.error('Bottles load error:', e);
    }

    // Players with team info
    try {
        const { results: pr } = await db.prepare(`
            SELECT p.id, p.username, p.display_name, p.lat, p.lon, p.port_id,
                   p.type, p.points, p.fuel,
                   t.name as team_name, t.color as team_color, pt.name as port_name
            FROM bq_players p
            LEFT JOIN bq_teams t ON p.team_id = t.id
            LEFT JOIN bq_ports pt ON p.port_id = pt.id
        `).all();
        players = pr || [];
        const { results: pip } = await db.prepare(`
            SELECT COUNT(DISTINCT player_id) as cnt FROM bq_moves WHERE created_at > datetime('now', '-24 hours')
        `).all();
        playersInPursuit = pip?.[0]?.cnt || 0;
    } catch (e) {
        console.error('Players load error:', e);
    }

    let market = { brent_price: 73, fed_rate: 5.25, cost_per_km: 0.73, brent_change: 0, fed_change: 0 };
    try {
        market = await db.prepare(`SELECT * FROM bq_market WHERE id = 'daily'`).first() || market;
    } catch {}

    return { bottles, players, market, playersInPursuit };
}
