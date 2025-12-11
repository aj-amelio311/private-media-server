// utils/smartSearchMovies.js
// Usage: const results = await smartSearchMovies(query)
const { getDatabase } = require('./database');
const { cosineSimilarity } = require('./cosineSimilarity');
// Assume getEmbedding is implemented elsewhere and imported
// const { getEmbedding } = require('./getEmbedding');

// Stub for getEmbedding if not implemented
async function getEmbedding(text) {
  // Replace with actual embedding logic
  return [];
}

/**
 * Smart search movies by query string using vector similarity
 * @param {string} query
 * @returns {Promise<Array>} Sorted movie rows by similarity
 */
async function smartSearchMovies(query) {
  const db = getDatabase();
  const queryEmbedding = await getEmbedding(query);
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
    results.push({ ...row, similarity });
  }
  stmt.free();
  // Sort by descending similarity
  results.sort((a, b) => b.similarity - a.similarity);
  return results;
}

module.exports = { smartSearchMovies };
