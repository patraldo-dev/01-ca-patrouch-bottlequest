// Scan Agora writings for keywords/clues and store in bq_keywords
// Uses simple TF-IDF-like extraction of significant words

const STOP_WORDS = new Set([
  'the','a','an','is','are','was','were','be','been','being','have','has','had',
  'do','does','did','will','would','could','should','may','might','shall','can',
  'to','of','in','for','on','with','at','by','from','as','into','through','during',
  'before','after','above','below','between','out','off','over','under','again','further',
  'then','once','here','there','when','where','why','how','all','each','every','both',
  'few','more','most','other','some','such','no','not','only','own','same','so','than',
  'too','very','just','because','but','and','or','if','while','about','up','it','its',
  'this','that','these','those','i','me','my','myself','we','our','ours','ourselves',
  'you','your','yours','yourself','yourselves','he','him','his','himself','she','her',
  'hers','herself','they','them','their','theirs','themselves','what','which','who','whom',
  'el','la','los','las','un','una','unos','unas','es','son','era','fueron','ser','estar',
  'estaba','estaban','ha','han','had','sido','tiene','tienen','puede','pueden','hacer',
  'que','de','en','por','para','con','sin','sobre','entre','hacia','hasta','desde','como',
  'pero','mas','menos','muy','ya','no','si','o','y','a','se','su','sus','mi','mis',
  'tu','tus','nos','les','le','lo','la','un','se','me','te','este','esta','esto',
  'ese','esa','eso','aquel','aquella','aquello','donde','cuando','como','porque',
  'le','la','les','des','du','de','un','une','des','les','est','sont','était','étaient',
  'être','avoir','a','ont','fait','peut','peuvent','dans','pour','sur','avec','sans',
  'entre','vers','depuis','comme','mais','plus','moins','très','déjà','non','si','ou',
  'et','à','se','son','sa','ses','mon','ton','notre','votre','leur','ce','cette',
  'ces','celui','celle','ceux','celles','où','quand','comment','pourquoi','aussi'
]);

export async function POST({ request, platform }) {
  const db = platform?.env?.DB;
  if (!db) return new Response(JSON.stringify({ error: 'No DB' }), { status: 500 });

  try {
    // Get recent published public writings
    const { results: writings } = await db.prepare(`
      SELECT id, title, content FROM writings
      WHERE status = 'published' AND visibility = 'public'
        AND content IS NOT NULL AND length(content) > 50
      ORDER BY created_at DESC LIMIT 50
    `).all();

    if (!writings?.length) {
      return new Response(JSON.stringify({ message: 'No writings found', keywords: 0 }));
    }

    // Extract keywords from each writing
    const allKeywords = [];

    for (const w of writings) {
      const text = (w.title + ' ' + w.content).toLowerCase();
      const words = text.match(/\p{L}{4,}/gu) || [];
      const freq = {};

      for (const word of words) {
        if (STOP_WORDS.has(word)) continue;
        freq[word] = (freq[word] || 0) + 1;
      }

      // Pick top 5 significant words per writing
      const sorted = Object.entries(freq)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5);

      for (const [word, count] of sorted) {
        if (count < 2) continue; // Must appear at least twice
        allKeywords.push({
          word,
          writing_id: w.id,
          count
        });
      }
    }

    // Deduplicate across writings, keep highest count
    const unique = {};
    for (const kw of allKeywords) {
      if (!unique[kw.word] || kw.count > unique[kw.word].count) {
        unique[kw.word] = kw;
      }
    }

    const keywordEntries = Object.values(unique).slice(0, 30); // Max 30 keywords

    if (keywordEntries.length === 0) {
      return new Response(JSON.stringify({ message: 'No keywords extracted', keywords: 0 }));
    }

    // Insert into bq_keywords (skip if word already exists and unclaimed)
    let inserted = 0;
    for (const kw of keywordEntries) {
      // Check if keyword already exists and unclaimed
      const existing = await db.prepare(
        `SELECT id FROM bq_keywords WHERE word = ? AND found_by_player_id IS NULL LIMIT 1`
      ).bind(kw.word).first();

      if (!existing) {
        // Check if it exists at all (claimed or not)
        const anyExisting = await db.prepare(
          `SELECT id FROM bq_keywords WHERE word = ? LIMIT 1`
        ).bind(kw.word).first();

        if (!anyExisting) {
          await db.prepare(
            `INSERT INTO bq_keywords (word, source_writing_id, points_value) VALUES (?, ?, ?)`
          ).bind(kw.word, kw.writing_id, 10).run();
          inserted++;
        }
      }
    }

    return new Response(JSON.stringify({
      message: `Extracted ${keywordEntries.length} candidates, inserted ${inserted} new keywords`,
      keywords: keywordEntries.map(k => k.word),
      total_available: keywordEntries.length
    }));

  } catch (e) {
    console.error('Keyword extraction error:', e);
    return new Response(JSON.stringify({ error: e.message }), { status: 500 });
  }
}

export async function GET({ request, platform }) {
  const db = platform?.env?.DB;
  if (!db) return new Response(JSON.stringify({ error: 'No DB' }), { status: 500 });

  try {
    // Get available (unclaimed) keywords
    const { results: keywords } = await db.prepare(`
      SELECT k.id, k.word, k.points_value, k.created_at,
             w.title as writing_title
      FROM bq_keywords k
      LEFT JOIN writings w ON k.source_writing_id = w.id
      WHERE k.found_by_player_id IS NULL
      ORDER BY k.created_at DESC
      LIMIT 50
    `).all();

    // Get claimed keywords count
    const claimed = await db.prepare(
      `SELECT COUNT(*) as count FROM bq_keywords WHERE found_by_player_id IS NOT NULL`
    ).first();

    return new Response(JSON.stringify({
      available: keywords || [],
      total_claimed: claimed?.count || 0
    }));

  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500 });
  }
}

export async function PUT({ request, platform }) {
  const db = platform?.env?.DB;
  if (!db) return new Response(JSON.stringify({ error: 'No DB' }), { status: 500 });

  try {
    const { keyword_id, player_id } = await request.json();
    if (!keyword_id || !player_id) {
      return new Response(JSON.stringify({ error: 'keyword_id and player_id required' }), { status: 400 });
    }

    const keyword = await db.prepare(
      `SELECT * FROM bq_keywords WHERE id = ? AND found_by_player_id IS NULL`
    ).bind(keyword_id).first();

    if (!keyword) {
      return new Response(JSON.stringify({ error: 'Keyword not found or already claimed' }), { status: 404 });
    }

    // Mark as claimed and add points
    await db.prepare(
      `UPDATE bq_keywords SET found_by_player_id = ? WHERE id = ?`
    ).bind(player_id, keyword_id).run();

    await db.prepare(
      `UPDATE bq_players SET points = points + ?, fuel = fuel + ? WHERE id = ?`
    ).bind(keyword.points_value, keyword.points_value, player_id).run();

    return new Response(JSON.stringify({
      message: 'Keyword claimed!',
      word: keyword.word,
      points: keyword.points_value
    }));

  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500 });
  }
}
