export async function load({ platform }) {
    const db = platform?.env?.DB;
    let bottles = [];
    let players = [];

    if (!db) {
        console.error('No DB binding');
        return { bottles, players };
    }

    // Bottles
    try {
        const { results } = await db.prepare(`
            SELECT b.* FROM bottles b WHERE b.status IN ('launched', 'sailing', 'beached', 'found')
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
                   t.name as team_name, t.color as team_color, pt.name as port_name
            FROM bq_players p
            LEFT JOIN bq_teams t ON p.team_id = t.id
            LEFT JOIN bq_ports pt ON p.port_id = pt.id
        `).all();
        players = pr || [];
        console.log('Players loaded:', players.length);
    } catch (e) {
        console.error('Players load error:', e);
    }

    return { bottles, players };
}
