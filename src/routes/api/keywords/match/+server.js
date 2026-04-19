// Check pending keyword proposals against a published writing
// Rules: no self-points, expire on first match, humans share cooperatively
import { json } from '@sveltejs/kit';

export async function POST({ request, platform }) {
  const db = platform?.env?.DB;
  if (!db) return json({ error: 'No DB' }, { status: 500 });

  try {
    const { writing_id } = await request.json();

    const writing = await db.prepare(
      `SELECT id, title, content, user_id FROM writings WHERE id = ? AND status = 'published' AND visibility = 'public'`
    ).bind(writing_id).first();

    if (!writing?.content) return json({ message: 'No valid writing', matches: 0 });

    const text = ((writing.title || '') + ' ' + writing.content).toLowerCase();
    const textWords = new Set(text.match(/\p{L}{4,}/gu) || []);

    // Get all pending proposals (look back 3 days for fairness)
    const { results: proposals } = await db.prepare(`
      SELECT id, word, player_id, points_earned FROM bq_keyword_proposals
      WHERE status = 'pending' AND proposal_date >= date('now', '-3 days')
    `).all();

    if (!proposals?.length) return json({ message: 'No pending proposals', matches: 0 });

    let matched = 0;
    const results = [];
    const matchedHumanIds = new Set();
    const matchedAiIds = new Set();

    for (const p of proposals) {
      const kw = p.word.toLowerCase();
      if (textWords.has(kw)) {
        // Expiry: mark as matched immediately (first match only)
        await db.prepare(
          `UPDATE bq_keyword_proposals SET status = 'matched', matched_writing_id = ? WHERE id = ?`
        ).bind(writing_id, p.id).run();

        // Determine if proposer is human or ai
        const player = await db.prepare(
          `SELECT type FROM bq_players WHERE id = ?`
        ).bind(p.player_id).first();

        const isHuman = player?.type === 'human';
        const isAuthor = p.player_id === writing.user_id; // self-match

        if (isHuman && !isAuthor) {
          matchedHumanIds.add(p.player_id);
        } else if (!isHuman) {
          matchedAiIds.add(p.player_id);
        }

        results.push({
          word: kw, proposer_id: p.player_id, points: p.points_earned,
          is_human: isHuman, is_author: isAuthor
        });
        matched++;
      }
    }

    // Award points: ALL humans share when ANY human keyword matches (cooperative)
    // EXCEPT: no points for humans whose OWN keyword matched their OWN writing
    if (matched > 0 && matchedHumanIds.size > 0) {
      const { results: allHumans } = await db.prepare(
        `SELECT id FROM bq_players WHERE type = 'human'`
      ).all();

      if (allHumans?.length) {
        // Sum points from all human non-self matches
        const totalBonus = results
          .filter(r => r.is_human && !r.is_author)
          .reduce((sum, r) => sum + r.points, 0);

        const fuelBonus = Math.floor(totalBonus / 2);

        for (const h of allHumans) {
          await db.prepare(
            `UPDATE bq_players SET points = points + ?, fuel = fuel + ? WHERE id = ?`
          ).bind(totalBonus, fuelBonus, h.id).run();
        }
      }
    }

    // AI bots get points only for their own matches (competitive, no cooperation)
    for (const aiId of matchedAiIds) {
      const aiBonus = results
        .filter(r => r.proposer_id === aiId)
        .reduce((sum, r) => sum + r.points, 0);

      await db.prepare(
        `UPDATE bq_players SET points = points + ?, fuel = fuel + ? WHERE id = ?`
      ).bind(aiBonus, Math.floor(aiBonus / 2), aiId).run();
    }

    // Collect matched human keywords as poison words (block Albot)
    const poisonWords = results
      .filter(r => r.is_human)
      .map(r => r.word);

    return json({
      message: `Found ${matched} keyword matches`,
      matches: matched,
      details: results,
      poison_words_added: poisonWords,
      human_bonus: matchedHumanIds.size > 0 ? results.filter(r => r.is_human && !r.is_author).reduce((s, r) => s + r.points, 0) : 0,
      ai_matches: matchedAiIds.size
    });

  } catch (e) {
    console.error('Keyword matching error:', e);
    return json({ error: e.message }, { status: 500 });
  }
}

// GET: retrieve poison words (to pass to Albot's writing prompt)
export async function GET({ request, platform }) {
  const db = platform?.env?.DB;
  if (!db) return json({ error: 'No DB' }, { status: 500 });

  try {
    const { results: poison } = await db.prepare(`
      SELECT DISTINCT word FROM bq_keyword_proposals
      WHERE status = 'matched'
        AND proposal_date >= date('now', '-14 days')
    `).all();

    return json({
      poison_words: (poison || []).map(p => p.word)
    });
  } catch (e) {
    return json({ error: e.message }, { status: 500 });
  }
}
