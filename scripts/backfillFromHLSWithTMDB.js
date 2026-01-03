// Script to backfill the movies table from HLS directories using TMDB API
// Usage: node scripts/backfillFromHLSWithTMDB.js
// This script will NOT alter or touch any files in the HLS directory.
// It will only read folder names, fetch metadata, and insert into the database.

const fs = require('fs');
const path = require('path');
const { initDatabase, insertMovie } = require('../utils/database');
const getMovieInfo = require('../utils/getMovieInfo');

require('dotenv').config({ path: path.join(__dirname, '../.env') });
const MOVIES_DIR = process.env.MOVIES_DIR || '/Volumes/External/Streaming/movies/';

async function main() {
  await initDatabase();
  const folders = fs.readdirSync(MOVIES_DIR, { withFileTypes: true })
    .filter(dirent => dirent.isDirectory() && dirent.name.endsWith('_hls'))
    .map(dirent => dirent.name);

  for (const folder of folders) {
    const title = folder.replace(/_hls$/, '');
    console.log(`\n[Backfill] Processing folder: ${folder}`);
    console.log(`[Backfill] Extracted title: ${title}`);
    try {
      // Fetch movie info using your existing utility (calls TMDB)
      console.log(`[Backfill] Fetching TMDB info for: ${title}`);
      const info = await getMovieInfo(MOVIES_DIR, title, 0);
      if (!info) {
        console.warn(`[Backfill] No TMDB info found for: ${title}`);
        continue;
      }
      console.log(`[Backfill] TMDB info found: id=${info.id}, original_title=${info.original_title}`);
      await insertMovie({
        id: info.id || Math.floor(Math.random() * 1000000000),
        title,
        original_title: info.original_title || title,
        original_language: info.original_language || 'en',
        overview: info.overview || '',
        poster_path: info.poster_path || '',
        release_date: info.release_date || '',
        vote_average: info.vote_average || 0,
        vote_count: info.vote_count || 0,
        popularity: info.popularity || 0,
        genre_ids: info.genre_ids || [],
        cast: info.cast || [],
        director: info.director || null,
        mpaa: info.mpaa || null,
        upload_attempts: 0,
        in_queue: 0,
        embedding: null,
        keywords: [],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      });
      console.log(`[Backfill] Inserted into database: ${title}`);
    } catch (err) {
      console.warn(`[Backfill] Failed for ${title}:`, err && err.stack ? err.stack : err.message);
    }
  }
  console.log('Backfill complete.');
}

main();
