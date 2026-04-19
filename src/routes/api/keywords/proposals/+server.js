// Keyword proposals: propose one keyword per day, check matches against Agora
import { json } from '@sveltejs/kit';

export async function POST({ request, platform }) {
  const db = platform?.env?.DB;
  if (!db) return json({ error: 'No DB' }, { status: 500 });

  try {
    const { player_id, word } = await request.json();
    if (!player_id || !word) return json({ error: 'player_id and word required' }, { status: 400 });

    const clean = word.trim().toLowerCase().replace(/[^\p{L}]/gu, '');
    if (clean.length < 3) return json({ error: 'Word too short (min 3 chars)' }, { status: 400 });

    const today = new Date().toISOString().split('T')[0];

    // Check daily limit (1 per day per player)
    const todayCount = await db.prepare(
      `SELECT COUNT(*) as c FROM bq_keyword_proposals WHERE player_id = ? AND proposal_date = ?`
    ).bind(player_id, today).first();

    if (todayCount?.c > 0) {
      return json({ error: 'You already proposed a keyword today. Try again tomorrow!' }, { status: 429 });
    }

    // Check if word already proposed today by anyone
    const dup = await db.prepare(
      `SELECT id, player_id as proposer FROM bq_keyword_proposals WHERE word = ? AND proposal_date = ? LIMIT 1`
    ).bind(clean, today).first();

    if (dup) {
      return json({ error: 'Keyword already proposed today by another player', already_exists: true, proposer: dup.proposer }, { status: 409 });
    }

    await db.prepare(
      `INSERT INTO bq_keyword_proposals (player_id, word) VALUES (?, ?)`
    ).bind(player_id, clean).run();

    return json({ message: 'Keyword proposed!', word: clean });

  } catch (e) {
    return json({ error: e.message }, { status: 500 });
  }
}

// GET: list today's proposals + recent matches
export async function GET({ request, platform }) {
  const db = platform?.env?.DB;
  if (!db) return json({ error: 'No DB' }, { status: 500 });

  try {
    const today = new Date().toISOString().split('T')[0];

    // Today's proposals
    const { results: proposals } = await db.prepare(`
      SELECT kp.id, kp.word, kp.status, kp.points_earned, kp.created_at,
             p.username, p.display_name, p.type as player_type, t.name as team_name, t.color as team_color
      FROM bq_keyword_proposals kp
      LEFT JOIN bq_players p ON kp.player_id = p.id
      LEFT JOIN bq_teams t ON p.team_id = t.id
      WHERE kp.proposal_date = ?
      ORDER BY kp.created_at DESC
    `).bind(today).all();

    // Recent matches (last 7 days)
    const { results: matches } = await db.prepare(`
      SELECT kp.word, kp.points_earned, kp.matched_writing_id,
             w.title as writing_title,
             p.username, p.display_name, p.type as player_type
      FROM bq_keyword_proposals kp
      LEFT JOIN writings w ON kp.matched_writing_id = w.id
      LEFT JOIN bq_players p ON kp.player_id = p.id
      WHERE kp.status = 'matched' AND kp.proposal_date >= date('now', '-7 days')
      ORDER BY kp.created_at DESC
      LIMIT 20
    `).all();

    // Human pool size (total unique words proposed by humans this week)
    const poolStats = await db.prepare(`
      SELECT
        COUNT(DISTINCT kp.word) as total_words,
        COUNT(DISTINCT CASE WHEN p.type = 'human' THEN kp.word END) as human_words,
        COUNT(DISTINCT CASE WHEN p.type = 'ai' THEN kp.word END) as ai_words
      FROM bq_keyword_proposals kp
      LEFT JOIN bq_players p ON kp.player_id = p.id
      WHERE kp.proposal_date >= date('now', '-7 days')
    `).first();

    return json({
      proposals: proposals || [],
      matches: matches || [],
      pool_stats: poolStats || { total_words: 0, human_words: 0, ai_words: 0 },
      today
    });

  } catch (e) {
    return json({ error: e.message }, { status: 500 });
  }
}
