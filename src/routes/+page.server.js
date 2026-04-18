export async function load({ platform }) {
    let bottles = [];
    try {
        const db = platform?.env?.DB;
        if (db) {
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
        }
    } catch (e) {
        console.error('Bottles load error:', e);
    }

    // Fetch players with team info
    let players = [];
    try {
        const { results: pr } = await db.prepare(`
            SELECT p.*, t.name as team_name, t.color as team_color, pt.name as port_name
            FROM bq_players p
            LEFT JOIN bq_teams t ON p.team_id = t.id
            LEFT JOIN bq_ports pt ON p.port_id = pt.id
        `).all();
        players = pr || [];
    } catch (e) {
        console.error('Players load error:', e);
    }

    return { bottles, players };
}
