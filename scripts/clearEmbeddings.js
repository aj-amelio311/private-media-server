// scripts/clearEmbeddings.js
// Usage: node scripts/clearEmbeddings.js
// Sets embedding = NULL for all movies that have an embedding, without deleting any movies or the database.

const { initDatabase, getDatabase, saveDatabase } = require('../utils/database');

async function clearEmbeddings() {
  await initDatabase();
  const db = getDatabase();
  const stmt = db.prepare('UPDATE movies SET embedding = NULL WHERE embedding IS NOT NULL');
  stmt.run();
  stmt.free();
  saveDatabase();
  console.log('All movie embeddings have been cleared (set to NULL).');
}

clearEmbeddings().catch(err => {
  console.error('Failed to clear embeddings:', err);
  process.exit(1);
});
