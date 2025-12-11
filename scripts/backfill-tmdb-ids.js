require('dotenv').config();
const { initDatabase, getDatabase, saveDatabase } = require('../utils/database');
const axios = require('axios');

async function getTMDBId(title, year) {
  const apiKey = process.env.TMDB_API_KEY;
  const url = 'https://api.themoviedb.org/3/search/movie';
  try {
    const resp = await axios.get(url, {
      params: {
        api_key: apiKey,
        query: title,
        year: year || undefined,
      },
      timeout: 5000,
    });
    if (resp.data && resp.data.results && resp.data.results.length > 0) {
      return resp.data.results[0].id;
    }
    return null;
  } catch (e) {
    console.error(`  ✗ Failed to fetch TMDB ID for "${title}":`, e.message);
    return null;
  }
}

async function backfillTMDBIds() {
  await initDatabase();
  const db = getDatabase();
  const stmt = db.prepare('SELECT title, release_date, id FROM movies');
  const movies = [];
  while (stmt.step()) {
    movies.push(stmt.getAsObject());
  }
  stmt.free();

  const missingIdMovies = movies.filter(m => !m.id || m.id === 0);
  console.log(`Found ${missingIdMovies.length} movies missing TMDB IDs\n`);

  let updated = 0;
  let failed = 0;

  for (let i = 0; i < missingIdMovies.length; i++) {
    const movie = missingIdMovies[i];
    const year = movie.release_date ? movie.release_date.split('-')[0] : undefined;
    console.log(`[${i + 1}/${missingIdMovies.length}] Searching TMDB for: "${movie.title}" (${year || 'unknown year'})`);
    const tmdbId = await getTMDBId(movie.title, year);
    if (tmdbId) {
      try {
        const updateStmt = db.prepare('UPDATE movies SET id = ? WHERE title = ?');
        updateStmt.run([tmdbId, movie.title]);
        updateStmt.free();
        saveDatabase();
        console.log(`  ✓ Updated TMDB ID: ${tmdbId}`);
        updated++;
      } catch (err) {
        console.error(`  ✗ Database error:`, err.message);
        failed++;
      }
    } else {
      console.log(`  ✗ No TMDB ID found`);
      failed++;
    }
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  console.log('\n========================================');
  console.log('TMDB ID backfill complete!');
  console.log(`✓ Updated: ${updated}`);
  console.log(`✗ Failed: ${failed}`);
  console.log('========================================');
}

backfillTMDBIds().catch(err => {
  console.error('Script failed:', err);
  process.exit(1);
});
