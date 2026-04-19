// Keyword proposals: propose one keyword per day, check matches against Agora
// Keywords are weighted by complexity, relevance, elegance — not just length
// Humans can't gain points from their OWN words (but they still block Albot)
// Keywords expire after first match
import { json } from '@sveltejs/kit';

// Weighting system: complex, nuanced, not trivial
function weightKeyword(word, dailyPrompt = null) {
  let score = 0;
  const len = word.length;

  // Base: all words 4+ chars get minimum
  score += 5;

  // Length tiers (but NOT the only factor)
  if (len >= 10) score += 8;
  else if (len >= 7) score += 5;
  else if (len >= 5) score += 2;

  // Morphological complexity: hyphens, apostrophes, unusual characters = creative effort
  if (word.includes('-') || word.includes("'")) score += 3;

  // Consonant clusters (less common letter combinations = more complex)
  const unusual = word.match(/[xjqzvkw]/gi);
  score += (unusual?.length || 0) * 2;

  // Vowel variety (all vowels present = richer word)
  const vowels = new Set(word.match(/[aeiouáéíóúàèìòùâêîôûäëïöü]/gi));
  score += Math.min(vowels.size, 5) * 1;

  // Syllable estimate (more syllables = more complex)
  const syllables = word.match(/[aeiouáéíóúàèìòùâêîôûäëïöüy]+/gi)?.length || 0;
  if (syllables >= 4) score += 4;
  else if (syllables >= 3) score += 2;

  // Prompt relevance bonus (if daily prompt context available)
  if (dailyPrompt) {
    const promptLower = dailyPrompt.toLowerCase();
    const promptWords = new Set(promptLower.match(/\p{L}{3,}/gu) || []);
    // Thematic resonance — not exact match, but shares roots/themes
    for (const pw of promptWords) {
      if (word.includes(pw) || pw.includes(word)) {
        score += 6; // Strong thematic link
        break;
      }
      // Shared first 3 chars = same root family
      if (word.slice(0, 3) === pw.slice(0, 3) && word !== pw) {
        score += 3; // Root family connection
        break;
      }
    }
  }

  // Elegance: not ending in common suffix (-tion, -ment, -ing, -ness, -able)
  const triteSuffixes = ['tion', 'ment', 'ing', 'ness', 'able', 'ible', 'ous', 'ive', 'ful', 'less'];
  const hasTriteSuffix = triteSuffixes.some(s => word.endsWith(s));
  if (!hasTriteSuffix && len >= 6) score += 3;

  // Rounding
  return Math.min(score, 30); // Cap at 30
}

export async function POST({ request, platform }) {
  const db = platform?.env?.DB;
  if (!db) return json({ error: 'No DB' }, { status: 500 });

  try {
    const { player_id, word } = await request.json();
    if (!player_id || !word) return json({ error: 'player_id and word required' }, { status: 400 });

    // Clean: keep unicode letters only, min 4 chars
    const clean = word.trim().toLowerCase().replace(/[^\p{L}]/gu, '');
    if (clean.length < 4) return json({ error: 'Too short — minimum 4 letters' }, { status: 400 });
    if (clean.length > 30) return json({ error: 'Too long — maximum 30 characters' }, { status: 400 });

    const today = new Date().toISOString().split('T')[0];

    // Check daily limit (1 per day per player)
    const todayCount = await db.prepare(
      `SELECT COUNT(*) as c FROM bq_keyword_proposals WHERE player_id = ? AND proposal_date = ?`
    ).bind(player_id, today).first();

    if (todayCount?.c > 0) {
      return json({ error: 'You already proposed a keyword today. Try again tomorrow!' }, { status: 429 });
    }

    // Check if word is already ACTIVE (pending) — expired/matched words can be resurrected
    const dup = await db.prepare(
      `SELECT id, player_id as proposer FROM bq_keyword_proposals WHERE word = ? AND status = 'pending' LIMIT 1`
    ).bind(clean).first();

    if (dup) {
      return json({ error: 'Word is already active in the hidden pool', already_exists: true, proposer: dup.proposer }, { status: 409 });
    }

    // Get today's daily prompt for relevance weighting
    const todayPrompt = await db.prepare(
      `SELECT prompt_text FROM prompts WHERE category = 'daily-community' AND locale = 'en' ORDER BY created_at DESC LIMIT 1`
    ).first();

    const points = weightKeyword(clean, todayPrompt?.prompt_text || null);

    await db.prepare(
      `INSERT INTO bq_keyword_proposals (player_id, word, points_earned) VALUES (?, ?, ?)`
    ).bind(player_id, clean, points).run();

    return json({
      message: 'Keyword deployed!',
      word: clean,
      points: points,
      breakdown: {
        base: 5,
        complexity_bonus: points - 5,
        total: points
      }
    });

  } catch (e) {
    return json({ error: e.message }, { status: 500 });
  }
}

// GET: list recent matches only (proposals are HIDDEN until matched)
export async function GET({ request, platform }) {
  const db = platform?.env?.DB;
  if (!db) return json({ error: 'No DB' }, { status: 500 });

  try {
    const today = new Date().toISOString().split('T')[0];

    // Check if current player already proposed today
    const playerId = new URL(request.url).searchParams.get('player_id');
    let todayProposed = false;
    if (playerId) {
      const count = await db.prepare(
        `SELECT COUNT(*) as c FROM bq_keyword_proposals WHERE player_id = ? AND proposal_date = ?`
      ).bind(playerId, today).first();
      todayProposed = count?.c > 0;
    }

    // Match history — revealed after first match, shows decay
    const { results: matches } = await db.prepare(`
      SELECT kp.word, kp.points_earned as base_points, kp.match_count,
             kp.last_matched_at, kp.proposal_date,
             w.title as writing_title,
             p.username, p.display_name, p.type as player_type
      FROM bq_keyword_proposals kp
      LEFT JOIN writings w ON kp.last_matched_writing_id = w.id
      LEFT JOIN bq_players p ON kp.player_id = p.id
      WHERE kp.status = 'pending' AND kp.match_count > 0
      ORDER BY kp.last_matched_at DESC
      LIMIT 30
    `).all();

    // Pool stats
    const poolStats = await db.prepare(`
      SELECT
        COUNT(DISTINCT kp.word) as total_words,
        COUNT(DISTINCT CASE WHEN p.type = 'human' THEN kp.word END) as human_words,
        COUNT(DISTINCT CASE WHEN p.type = 'ai' THEN kp.word END) as ai_words,
        COUNT(DISTINCT CASE WHEN kp.match_count > 0 THEN kp.word END) as revealed_words
      FROM bq_keyword_proposals kp
      LEFT JOIN bq_players p ON kp.player_id = p.id
      WHERE kp.status = 'pending'
    `).first();

    // Poison words (human keywords that have matched — block Albot)
    const { results: poison } = await db.prepare(`
      SELECT DISTINCT kp.word, kp.points_earned as base_points, kp.match_count
      FROM bq_keyword_proposals kp
      LEFT JOIN bq_players p ON kp.player_id = p.id
      WHERE kp.status = 'pending' AND kp.match_count > 0 AND p.type = 'human'
      ORDER BY kp.match_count ASC
    `).all();

    // Calculate current values with decay
    const decayedMatches = (matches || []).map(m => ({
      ...m,
      current_value: Math.ceil(m.base_points * Math.pow(0.5, m.match_count - 1) * 100000) / 100000
    }));

    const decayedPoison = (poison || []).map(p => ({
      ...p,
      current_value: Math.ceil(p.base_points * Math.pow(0.5, p.match_count - 1) * 100000) / 100000
    }));

    return json({
      matches: decayedMatches,
      pool_stats: poolStats || { total_words: 0, human_words: 0, ai_words: 0, revealed_words: 0 },
      poison_words: decayedPoison,
      today_proposed: todayProposed,
      today
    });

  } catch (e) {
    return json({ error: e.message }, { status: 500 });
  }
}
