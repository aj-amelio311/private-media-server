import fs from 'fs';
import path from 'path';
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
  // SAFETY: Abort if database file does not exist
  const DB_PATH = path.join(path.dirname(new URL(import.meta.url).pathname), '../data/movies.db');
  if (!fs.existsSync(DB_PATH)) {
    console.error('ABORT: Database file does not exist. This script will NOT create a new database or table.');
    process.exit(1);
  }
  await initDatabase();
  const db = getDatabase();
  const stmt = db.prepare(`SELECT id, title, original_title, overview, genre_ids, keywords, embedding, release_date, tagline, vote_average, vote_count, belongs_to_collection, production_companies, production_countries, spoken_languages, mpaa FROM movies WHERE embedding IS NULL`);
  let updated = 0;
  while (stmt.step()) {
    const row = stmt.getAsObject();
    const genres = row.genre_ids ? JSON.parse(row.genre_ids) : [];
    const keywords = row.keywords ? JSON.parse(row.keywords) : [];
    const collection = row.belongs_to_collection ? JSON.parse(row.belongs_to_collection) : null;
    const companies = row.production_companies ? JSON.parse(row.production_companies) : [];
    const countries = row.production_countries ? JSON.parse(row.production_countries) : [];
    const languages = row.spoken_languages ? JSON.parse(row.spoken_languages) : [];

    let year = 'Unknown Year';
    if (row.release_date && typeof row.release_date === 'string' && row.release_date.includes('-')) {
      year = row.release_date.split('-')[0];
    } else if (row.release_date && typeof row.release_date === 'string') {
      year = row.release_date;
    }

    // Enriched embedding text template
    const text = [
      `${row.title}${row.original_title && row.original_title !== row.title ? ` (Original title: ${row.original_title})` : ''}.`,
      row.tagline ? `Tagline: ${row.tagline}.` : '',
      row.overview ? `Overview: ${row.overview}` : '',
      genres.length ? `Genres: ${genres.join(', ')}.` : '',
      keywords.length ? `Keywords: ${keywords.join(', ')}.` : '',
      row.mpaa ? `MPAA Rating: ${row.mpaa}.` : '',
      typeof row.vote_average === 'number' ? `Average rating: ${row.vote_average}.` : '',
      typeof row.vote_count === 'number' ? `Vote count: ${row.vote_count}.` : '',
      year ? `Release year: ${year}.` : '',
      collection && collection.name ? `Part of collection: ${collection.name}.` : '',
      companies.length ? `Production companies: ${companies.map(c => c.name).filter(Boolean).join(', ')}.` : '',
      countries.length ? `Production countries: ${countries.map(c => c.name).filter(Boolean).join(', ')}.` : '',
      languages.length ? `Spoken languages: ${languages.map(l => l.english_name || l.name).filter(Boolean).join(', ')}.` : ''
    ].filter(Boolean).join(' ');

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
