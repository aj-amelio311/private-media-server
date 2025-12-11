import { getDatabase, initDatabase } from '../utils/database.js';
import { getEmbedding } from '../utils/getEmbedding.mjs';
import { saveDatabase } from '../utils/database.js';



// backfillEmbeddings.ts
// Run: npx ts-node backfillEmbeddings.ts


// Polyfill fetch, Headers, Request, Response, FormData for OpenAI/node-fetch compatibility
// backfillEmbeddings.mjs
// Run: node scripts/backfillEmbeddings.mjs

import fetch, { Headers, Request, Response, FormData } from 'node-fetch';
globalThis.fetch = fetch;
globalThis.Headers = Headers;
globalThis.Request = Request;
globalThis.Response = Response;
globalThis.FormData = FormData;


// Stub for getEmbedding if not implemented

async function main() {
  await initDatabase();
  const db = getDatabase();
  const stmt = db.prepare('SELECT id, title, original_title, overview, genre_ids, keywords, embedding FROM movies WHERE embedding IS NULL LIMIT 200');
  let updated = 0;
  while (stmt.step()) {
    const row = stmt.getAsObject();
    const genres = JSON.parse(row.genre_ids || '[]');
    const keywords = row.keywords ? JSON.parse(row.keywords) : [];
    const text = `${row.title}. ${row.overview}. Genres: ${genres.join(', ')}. Keywords: ${keywords.join(', ')}.`;
    console.log('Embedding input:', text);
    let embedding = [];
    try {
      embedding = await getEmbedding(text);
      console.log('Embedding output:', embedding);
    } catch (e) {
      console.warn(`Embedding failed for movie ${row.title}:`, e);
      continue;
    }
    try {
      const updateStmt = db.prepare('UPDATE movies SET embedding = ? WHERE id = ?');
      updateStmt.run([JSON.stringify(embedding), row.id]);
      updateStmt.free();
      updated++;
      console.log(`Updated embedding for: ${row.title}`);
    } catch (err) {
      console.error(`Failed to update embedding for ${row.title}:`, err);
    }
  }
  stmt.free();
  // Persist changes to disk
  saveDatabase();
  if (db.close) db.close();
  console.log(`Backfill complete. Updated ${updated} movies.`);
}

main().catch(err => {
  console.error('Backfill error:', err);
  process.exit(1);
});
