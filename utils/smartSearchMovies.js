const { getDatabase } = require('./database');
const { cosineSimilarity } = require('./cosineSimilarity');
let getEmbedding;
try {
  // Try CJS require first
  getEmbedding = require('./getEmbedding').getEmbedding;
} catch (e) {
  // Fallback to dynamic import for ESM
  getEmbedding = async (text) => {
    const mod = await import('./getEmbedding.mjs');
    return mod.getEmbedding(text);
  };
}

/**
 * Smart search movies by query string using vector similarity
 * @param {string} query
 * @returns {Promise<Array>} Sorted movie rows by similarity
 */
async function smartSearchMovies(query) {
  const db = getDatabase();
  const queryEmbedding = await getEmbedding(query);
  const queryWords = query.toLowerCase().split(/\s+/).filter(Boolean);

  // Detect decade in query (e.g., 80s, 90s, 2000s, 2010s)
  let decadeMatch = query.match(/(\d{2,4})s/);
  let decadeStart = null, decadeEnd = null;
  if (decadeMatch) {
    let decadeStr = decadeMatch[1];
    if (decadeStr.length === 2) {
      // e.g., 80s => 1980
      decadeStart = parseInt('19' + decadeStr);
    } else if (decadeStr.length === 4) {
      decadeStart = parseInt(decadeStr);
    }
    if (decadeStart) decadeEnd = decadeStart + 9;
  }

  const stmt = db.prepare('SELECT * FROM movies WHERE embedding IS NOT NULL');
  const results = [];
  while (stmt.step()) {
    const row = stmt.getAsObject();
    let rowEmbedding;
    try {
      rowEmbedding = JSON.parse(row.embedding);
    } catch {
      rowEmbedding = null;
    }
    if (!Array.isArray(rowEmbedding)) continue;
    const similarity = cosineSimilarity(queryEmbedding, rowEmbedding);

    // Lexical score: weighted match for title, overview, keywords, tagline
    let titleText = row.title ? row.title.toLowerCase() : '';
    let overviewText = row.overview ? row.overview.toLowerCase() : '';
    let keywordsText = '';
    if (row.keywords) {
      try {
        const kws = Array.isArray(row.keywords) ? row.keywords : JSON.parse(row.keywords);
        if (Array.isArray(kws)) keywordsText = kws.join(' ').toLowerCase();
      } catch {}
    }
    let taglineText = row.tagline ? row.tagline.toLowerCase() : '';

    let titleMatches = 0, overviewMatches = 0, keywordsMatches = 0, taglineMatches = 0;
    for (const word of queryWords) {
      if (titleText.includes(word)) titleMatches++;
      if (overviewText.includes(word)) overviewMatches++;
      if (keywordsText.includes(word)) keywordsMatches++;
      if (taglineText.includes(word)) taglineMatches++;
    }
    const n = queryWords.length || 1;
    // Weight: title 0.2, overview 0.3, keywords 0.3, tagline 0.2
    const lexicalScore = (
      (titleMatches / n) * 0.2 +
      (overviewMatches / n) * 0.3 +
      (keywordsMatches / n) * 0.3 +
      (taglineMatches / n) * 0.2
    );

    // Decade logic
    let decadeBonus = 0;
    if (decadeStart && row.release_date && typeof row.release_date === 'string') {
      const year = parseInt(row.release_date.split('-')[0]);
      if (year >= decadeStart && year <= decadeEnd) {
        decadeBonus = 1;
      } else {
        continue; 
      }
    }

    // Hybrid score: weighted sum, with decade bonus
    const finalScore = (similarity * 0.7) + (lexicalScore * 0.3) + (decadeBonus * 2);

    if (finalScore > 0.15) {
      results.push({
        ...row,
        poster: row.poster_path || row.poster || '',
        similarity,
        lexicalScore,
        finalScore
      });
    }
  }
  stmt.free();
  // Sort by descending finalScore
  results.sort((a, b) => b.finalScore - a.finalScore);
  // Return only the top x most relevant results
  return results.slice(0, 15);
}

module.exports = { smartSearchMovies };
