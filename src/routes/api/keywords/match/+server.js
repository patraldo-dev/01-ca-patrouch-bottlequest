// Check if today's pending keywords match a newly published writing
// Called from patrouch.ca on publish, or via cron
import { json } from '@sveltejs/kit';

export async function POST({ request, platform }) {
  const db = platform?.env?.DB;
  if (!db) return json({ error: 'No DB' }, { status: 500 });

  try {
    const { writing_id } = await request.json();

    // Get the writing content
    const writing = await db.prepare(
      `SELECT id, title, content FROM writings WHERE id = ? AND status = 'published' AND visibility = 'public'`
    ).bind(writing_id).first();

    if (!writing?.content) return json({ message: 'No valid writing', matches: 0 });

    const text = ((writing.title || '') + ' ' + writing.content).toLowerCase();
    const textWords = new Set(text.match(/\p{L}{4,}/gu) || []);

    // Get all pending proposals (today + last 3 days to give fairness)
    const { results: proposals } = await db.prepare(`
      SELECT id, word, player_id FROM bq_keyword_proposals
      WHERE status = 'pending' AND proposal_date >= date('now', '-3 days')
    `).all();

    if (!proposals?.length) return json({ message: 'No pending proposals', matches: 0 });

    let matched = 0;
    const matchedWords = [];

    for (const p of proposals) {
      const kw = p.word.toLowerCase();
      // Check if keyword appears in text (whole word)
      const regex = new RegExp(`\\b${kw}\\b`, 'u');
      if (textWords.has(kw) || regex.test(text)) {
        // Mark as matched
        const points = kw.length >= 7 ? 15 : 10; // Longer words = more points
        await db.prepare(
          `UPDATE bq_keyword_proposals SET status = 'matched', matched_writing_id = ?, points_earned = ? WHERE id = ?`
        ).bind(writing_id, points, p.id).run();

        matchedWords.push({ word: kw, proposer_id: p.player_id, points });
        matched++;
      }
    }

    // Award points to ALL human players when ANY human keyword matches
    // (cooperative model: humans share victory)
    if (matched > 0) {
      // Get all human players
      const { results: humans } = await db.prepare(
        `SELECT id FROM bq_players WHERE type = 'human'`
      ).all();

      if (humans?.length) {
        const humanIds = humans.map(h => h.id);
        // Check if any match was proposed by a human
        const humanMatches = matchedWords.filter(m => {
          // Check if proposer is human
          return humanIds.includes(m.proposer_id);
        });

        if (humanMatches.length > 0) {
          const bonusPerHuman = humanMatches.reduce((sum, m) => sum + m.points, 0);
          for (const hid of humanIds) {
            await db.prepare(
              `UPDATE bq_players SET points = points + ?, fuel = fuel + ? WHERE id = ?`
            ).bind(bonusPerHuman, Math.floor(bonusPerHuman / 2), hid).run();
          }
        }

        // Award points to AI players for their own matches only
        const aiMatches = matchedWords.filter(m => !humanIds.includes(m.proposer_id));
        for (const m of aiMatches) {
          await db.prepare(
            `UPDATE bq_players SET points = points + ?, fuel = fuel + ? WHERE id = ?`
          ).bind(m.points, Math.floor(m.points / 2), m.proposer_id).run();
        }
      }
    }

    return json({
      message: `Found ${matched} keyword matches`,
      matches: matched,
      matched_words: matchedWords
    });

  } catch (e) {
    console.error('Keyword matching error:', e);
    return json({ error: e.message }, { status: 500 });
  }
}
