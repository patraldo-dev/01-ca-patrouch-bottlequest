// Check pending keyword proposals against a published writing
// Decay model: points halve with each match (base * decay_rate^match_count)
// 5 decimal precision, round up
// No expiry — words stay active but lose force over time
import { json } from '@sveltejs/kit';

function decayPoints(basePoints, matchCount, decayRate = 0.5) {
  const earned = basePoints * Math.pow(decayRate, matchCount);
  return Math.ceil(earned * 100000) / 100000; // 5 decimals, round up
}

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

    // Get all active proposals (pending status, any date)
    const { results: proposals } = await db.prepare(`
      SELECT id, word, player_id, points_earned, match_count, decay_rate FROM bq_keyword_proposals
      WHERE status = 'pending'
    `).all();

    if (!proposals?.length) return json({ message: 'No active proposals', matches: 0 });

    let matched = 0;
    const results = [];
    const matchedHumanIds = new Set();
    const matchedAiIds = new Set();
    const newPoisonWords = [];

    for (const p of proposals) {
      const kw = p.word.toLowerCase();
      if (!textWords.has(kw)) continue;

      // Calculate decayed points
      const newMatchCount = (p.match_count || 0) + 1;
      const earned = decayPoints(p.points_earned, p.match_count || 0, p.decay_rate || 0.5);

      // Update: increment match_count, stay pending (never expires), record latest match
      await db.prepare(
        `UPDATE bq_keyword_proposals
         SET match_count = ?, last_matched_at = datetime('now'), last_matched_writing_id = ?
         WHERE id = ?`
      ).bind(newMatchCount, writing_id, p.id).run();

      const player = await db.prepare(`SELECT type FROM bq_players WHERE id = ?`).bind(p.player_id).first();
      const isHuman = player?.type === 'human';
      const isAuthor = p.player_id === writing.user_id;

      if (isHuman && !isAuthor) {
        matchedHumanIds.add(p.player_id);
        newPoisonWords.push(kw);
      } else if (!isHuman) {
        matchedAiIds.add(p.player_id);
      }

      results.push({
        word: kw, proposer_id: p.player_id,
        base_points: p.points_earned,
        earned: earned,
        match_number: newMatchCount,
        is_human: isHuman, is_author: isAuthor
      });
      matched++;
    }

    // Award ALL humans cooperatively (no self-points)
    if (matched > 0 && matchedHumanIds.size > 0) {
      const { results: allHumans } = await db.prepare(`SELECT id FROM bq_players WHERE type = 'human'`).all();
      if (allHumans?.length) {
        const totalBonus = results
          .filter(r => r.is_human && !r.is_author)
          .reduce((sum, r) => sum + r.earned, 0);
        const fuelBonus = totalBonus / 2;

        for (const h of allHumans) {
          await db.prepare(
            `UPDATE bq_players SET points = points + ?, fuel = fuel + ? WHERE id = ?`
          ).bind(totalBonus, fuelBonus, h.id).run();
        }
      }
    }

    // AI bots: competitive, own matches only
    for (const aiId of matchedAiIds) {
      const aiBonus = results
        .filter(r => r.proposer_id === aiId)
        .reduce((sum, r) => sum + r.earned, 0);

      await db.prepare(
        `UPDATE bq_players SET points = points + ?, fuel = fuel + ? WHERE id = ?`
      ).bind(aiBonus, aiBonus / 2, aiId).run();
    }

    return json({
      message: `Found ${matched} keyword matches`,
      matches: matched,
      details: results,
      poison_words_added: newPoisonWords,
      human_bonus: matchedHumanIds.size > 0 ? results.filter(r => r.is_human && !r.is_author).reduce((s, r) => s + r.earned, 0) : 0,
      ai_matches: matchedAiIds.size
    });

  } catch (e) {
    console.error('Keyword matching error:', e);
    return json({ error: e.message }, { status: 500 });
  }
}

// GET: retrieve poison words (all human keywords that have matched at least once)
export async function GET({ request, platform }) {
  const db = platform?.env?.DB;
  if (!db) return json({ error: 'No DB' }, { status: 500 });

  try {
    const { results: poison } = await db.prepare(`
      SELECT DISTINCT kp.word, kp.points_earned, kp.match_count,
             kp.last_matched_at, p.display_name, p.username
      FROM bq_keyword_proposals kp
      LEFT JOIN bq_players p ON kp.player_id = p.id
      WHERE kp.status = 'pending' AND kp.match_count > 0 AND p.type = 'human'
      ORDER BY kp.last_matched_at DESC
      LIMIT 100
    `).all();

    return json({
      poison_words: (poison || []).map(p => ({
        word: p.word,
        base_points: p.points_earned,
        current_value: decayPoints(p.points_earned, p.match_count, 0.5),
        match_count: p.match_count,
        last_matched: p.last_matched_at,
        proposer: p.display_name || p.username
      }))
    });
  } catch (e) {
    return json({ error: e.message }, { status: 500 });
  }
}
