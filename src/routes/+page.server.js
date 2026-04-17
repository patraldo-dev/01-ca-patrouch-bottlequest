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

    return { bottles };
}
