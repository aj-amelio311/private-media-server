require('dotenv').config();
const { initDatabase, getDatabase, saveDatabase } = require('../utils/database');
const axios = require('axios');

// Delay helper to prevent API throttling
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function getMovieKeywords(movieId) {
  const apiKey = process.env.TMDB_API_KEY || 'PLACEHOLDER_API_KEY';
  const url = `https://api.themoviedb.org/3/movie/${movieId}/keywords`;
  console.log(`  → Requesting: ${url}?api_key=${apiKey}`);
  try {
    const resp = await axios.get(url, {
      params: { api_key: apiKey },
      timeout: 5000,
    });
    console.log(`  → Response JSON:`, JSON.stringify(resp.data));
    return resp.data;
  } catch (e) {
    console.error(`  ✗ Failed to fetch keywords for movie ID ${movieId}:`, e.message);
    return null;
  }
}

async function backfillKeywords() {
  console.log('Starting keywords backfill...\n');
  
  // Initialize database
  await initDatabase();
  console.log('Database initialized\n');
  
  const db = getDatabase();
  
  // Add keywords column if it doesn't exist
  try {
    const checkStmt = db.prepare("SELECT keywords FROM movies LIMIT 1");
    checkStmt.step();
    checkStmt.free();
    console.log('Keywords column already exists\n');
  } catch (err) {
    console.log('Adding keywords column...');
    db.run("ALTER TABLE movies ADD COLUMN keywords TEXT");
    saveDatabase();
    console.log('Keywords column added\n');
  }
  
  // Get all movies
  const stmt = db.prepare('SELECT id, title, keywords FROM movies');
  const movies = [];
  while (stmt.step()) {
    movies.push(stmt.getAsObject());
  }
  stmt.free();
  
  console.log(`Found ${movies.length} total movies\n`);
  
  // Filter movies without keywords
  const moviesNeedingKeywords = movies.filter(m => !m.keywords);
  console.log(`${moviesNeedingKeywords.length} movies need keywords data\n`);
  
  if (moviesNeedingKeywords.length === 0) {
    console.log('All movies already have keywords data!');
    return;
  }
  
  let updated = 0;
  let failed = 0;
  let skipped = 0;
  
  for (let i = 0; i < moviesNeedingKeywords.length; i++) {
    const movie = moviesNeedingKeywords[i];
    const progress = `[${i + 1}/${moviesNeedingKeywords.length}]`;
    
    console.log(`${progress} Processing: ${movie.title}`);
    
    // Skip if movie doesn't have a TMDB ID
    if (!movie.id) {
      console.log(`  ⚠ Skipping - no TMDB ID`);
      skipped++;
      continue;
    }
    
    // Fetch keywords
    const data = await getMovieKeywords(movie.id);
    
    if (!data || !data.keywords) {
      console.log(`  ✗ Failed to get keywords`);
      failed++;
      await delay(1000); // Wait 1 second before next request even on failure
      continue;
    }
    
    // Extract keyword names
    const keywords = data.keywords.map(kw => kw.name);
    
    if (keywords.length === 0) {
      console.log(`  ⚠ No keywords found`);
      skipped++;
      await delay(1000);
      continue;
    }
    
    // Store as JSON
    const keywordsJson = JSON.stringify(keywords);
    
    // Update database
    try {
      const updateStmt = db.prepare('UPDATE movies SET keywords = ?, updated_at = CURRENT_TIMESTAMP WHERE title = ?');
      updateStmt.run([keywordsJson, movie.title]);
      updateStmt.free();
      saveDatabase();
      
      console.log(`  ✓ Updated: ${keywords.length} keywords (${keywords.slice(0, 3).join(', ')}...)`);
      updated++;
    } catch (err) {
      console.error(`  ✗ Database error:`, err.message);
      failed++;
    }
    
    // Wait 1 second between requests to avoid API throttling (40 requests per 10 seconds)
    if (i < moviesNeedingKeywords.length - 1) {
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
backfillKeywords().catch(err => {
  console.error('Script failed:', err);
  process.exit(1);
});
