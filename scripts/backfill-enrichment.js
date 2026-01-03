// scripts/backfill-enrichment.js
// Backfills TMDB enrichment fields for all movies, only updating missing fields.
require('dotenv').config();
const { initDatabase, getDatabase, saveDatabase } = require('../utils/database');
const axios = require('axios');

const TMDB_API_KEY = process.env.TMDB_API_KEY || 'PLACEHOLDER_API_KEY';

async function getMovieDetails(tmdbId) {
  const url = `https://api.themoviedb.org/3/movie/${tmdbId}`;
  try {
    const resp = await axios.get(url, {
      params: { api_key: TMDB_API_KEY, append_to_response: 'keywords' },
      timeout: 8000,
    });
    return resp.data;
  } catch (e) {
    console.error(`[TMDB] Failed to fetch details for ID ${tmdbId}:`, e.message);
    return null;
  }
}

async function backfillEnrichment() {
  await initDatabase();
  const db = getDatabase();
  const stmt = db.prepare('SELECT id, title, tagline, belongs_to_collection, production_companies, production_countries, spoken_languages FROM movies');
  const movies = [];
  while (stmt.step()) {
    movies.push(stmt.getAsObject());
  }
  stmt.free();

  let updated = 0;
  for (const movie of movies) {
    if (!movie.id) continue;
    // Only update if any enrichment field is missing/null/empty
    if (
      !movie.tagline ||
      !movie.belongs_to_collection ||
      !movie.production_companies ||
      !movie.production_countries ||
      !movie.spoken_languages
    ) {
      const details = await getMovieDetails(movie.id);
      if (!details) continue;
      const updateStmt = db.prepare(`UPDATE movies SET tagline = ?, belongs_to_collection = ?, production_companies = ?, production_countries = ?, spoken_languages = ? WHERE id = ?`);
      updateStmt.run([
        details.tagline || null,
        details.belongs_to_collection ? JSON.stringify(details.belongs_to_collection) : null,
        details.production_companies ? JSON.stringify(details.production_companies.map(c => c.name)) : null,
        details.production_countries ? JSON.stringify(details.production_countries.map(c => c.name)) : null,
        details.spoken_languages ? JSON.stringify(details.spoken_languages.map(l => l.english_name)) : null,
        movie.id
      ]);
      updateStmt.free();
      saveDatabase();
      updated++;
      console.log(`[Enrichment] Updated: ${movie.title}`);
      // TMDB rate limit safety
      await new Promise(res => setTimeout(res, 500));
    }
  }
  console.log(`\nBackfill complete. Updated ${updated} movies.`);
}

backfillEnrichment().catch(err => {
  console.error('Script failed:', err);
  process.exit(1);
});
