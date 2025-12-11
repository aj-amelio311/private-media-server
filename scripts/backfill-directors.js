require('dotenv').config();
const { initDatabase, getAllMovies, getDatabase, saveDatabase } = require('../utils/database');
const axios = require('axios');

// Delay helper to prevent API throttling
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function getMovieCredits(movieId) {
  const apiKey = process.env.TMDB_API_KEY || 'PLACEHOLDER_API_KEY';
  const url = `https://api.themoviedb.org/3/movie/${movieId}/credits`;
  try {
    const resp = await axios.get(url, {
      params: { api_key: apiKey },
      timeout: 5000,
    });
    return resp.data;
  } catch (e) {
    console.error(`  ✗ Failed to fetch credits for movie ID ${movieId}:`, e.message);
    return null;
  }
}

async function backfillDirectors() {
  console.log('Starting director backfill...\n');
  
  // Initialize database
  await initDatabase();
  console.log('Database initialized\n');
  
  // Get all movies
  const movies = getAllMovies();
  console.log(`Found ${movies.length} total movies\n`);
  
  // Filter movies without director
  const moviesNeedingDirector = movies.filter(m => !m.director);
  console.log(`${moviesNeedingDirector.length} movies need director data\n`);
  
  if (moviesNeedingDirector.length === 0) {
    console.log('All movies already have director data!');
    return;
  }
  
  let updated = 0;
  let failed = 0;
  let skipped = 0;
  
  const db = getDatabase();
  
  for (let i = 0; i < moviesNeedingDirector.length; i++) {
    const movie = moviesNeedingDirector[i];
    const progress = `[${i + 1}/${moviesNeedingDirector.length}]`;
    
    console.log(`${progress} Processing: ${movie.title}`);
    
    // Skip if movie doesn't have a TMDB ID
    if (!movie.id) {
      console.log(`  ⚠ Skipping - no TMDB ID`);
      skipped++;
      continue;
    }
    
    // Fetch credits
    const credits = await getMovieCredits(movie.id);
    
    if (!credits || !credits.crew) {
      console.log(`  ✗ Failed to get credits`);
      failed++;
      await delay(1000); // Wait 1 second before next request even on failure
      continue;
    }
    
    // Find director
    const director = credits.crew.find(person => person.job === 'Director');
    
    if (!director) {
      console.log(`  ⚠ No director found in credits`);
      skipped++;
      await delay(1000);
      continue;
    }
    
    // Update database
    try {
      const stmt = db.prepare('UPDATE movies SET director = ?, updated_at = CURRENT_TIMESTAMP WHERE title = ?');
      stmt.run([director.name, movie.title]);
      stmt.free();
      saveDatabase();
      
      console.log(`  ✓ Updated: ${director.name}`);
      updated++;
    } catch (err) {
      console.error(`  ✗ Database error:`, err.message);
      failed++;
    }
    
    // Wait 1 second between requests to avoid API throttling (40 requests per 10 seconds)
    if (i < moviesNeedingDirector.length - 1) {
      await delay(1000);
    }
  }
  
  console.log('\n========================================');
  console.log('Backfill complete!');
  console.log(`✓ Updated: ${updated}`);
  console.log(`⚠ Skipped: ${skipped}`);
  console.log(`✗ Failed: ${failed}`);
  console.log('========================================');
}

// Run the script
backfillDirectors().catch(err => {
  console.error('Script failed:', err);
  process.exit(1);
});
