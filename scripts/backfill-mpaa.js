require('dotenv').config();
const fetch = require('node-fetch');
const { initDatabase, getDatabase, saveDatabase } = require('../utils/database');
const TMDB_API_KEY = process.env.TMDB_API_KEY;

async function getMPAA(tmdbId) {
  const url = `https://api.themoviedb.org/3/movie/${tmdbId}/release_dates?api_key=${TMDB_API_KEY}`;
  try {
    const res = await fetch(url);
    const data = await res.json();
    const us = data.results && data.results.find(r => r.iso_3166_1 === "US");
    if (!us || !us.release_dates) return null;
    const rated = us.release_dates.find(entry => entry.certification);
    return rated ? rated.certification : null;
  } catch (err) {
    console.error(`[MPAA] Error fetching for TMDB ID ${tmdbId}:`, err.message);
    return null;
  }
}

async function backfillMPAA() {
  const db = getDatabase();
  const stmt = db.prepare('SELECT id, title, mpaa FROM movies');
  const movies = [];
  while (stmt.step()) {
    movies.push(stmt.getAsObject());
  }
  stmt.free();

  console.log(`Found ${movies.length} movies in database.`);

  let updated = 0;
  let failed = 0;
  let skipped = 0;

  for (let i = 0; i < movies.length; i++) {
    const row = movies[i];
    const progress = `[${i + 1}/${movies.length}]`;
    if (!row.id) {
      console.log(`${progress} Skipping: ${row.title} (no TMDB ID)`);
      skipped++;
      continue;
    }
    if (row.mpaa !== null && row.mpaa !== undefined && row.mpaa !== '') {
      console.log(`${progress} Skipping: ${row.title} (${row.id}) already has MPAA: ${row.mpaa}`);
      skipped++;
      continue;
    }
    try {
      const mpaa = await getMPAA(row.id);
      if (mpaa) {
        const updateStmt = db.prepare('UPDATE movies SET mpaa = ? WHERE id = ?');
        updateStmt.run([mpaa, row.id]);
        updateStmt.free();
        updated++;
        console.log(`${progress} Updated: ${row.title} (${row.id}) => ${mpaa}`);
      } else {
        console.log(`${progress} No rating for: ${row.title} (${row.id})`);
      }
      await new Promise(resolve => setTimeout(resolve, 300)); // Delay to avoid throttling
    } catch (err) {
      console.error(`${progress} Error for ${row.title} (${row.id}):`, err.message);
      failed++;
    }
  }
  saveDatabase();
  console.log(`\nMPAA backfill complete. Updated: ${updated}, Skipped: ${skipped}, Failed: ${failed}`);
}

initDatabase().then(() => backfillMPAA()).catch(err => {
  console.error('[MPAA] Fatal error:', err.message);
});
