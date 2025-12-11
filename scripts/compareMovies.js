#!/usr/bin/env node
/**
 * Compare external drive movie files with database entries.
 * Usage: node compareMovies.js /path/to/external/drive
 */
const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();

// CONFIG: Update this path to your database file if needed
const DB_PATH = path.resolve(__dirname, '../utils/database.sqlite');

if (process.argv.length < 3) {
  console.error('Usage: node compareMovies.js /path/to/external/drive');
  process.exit(1);
}

const MOVIE_DIR = process.argv[2];

// 1. Read all movie files from the external drive folder
function getMovieFiles(dir) {
  return fs.readdirSync(dir)
    .filter(f => f.match(/\.(mp4|mkv|avi|mov)$/i));
}

// 2. Get all movie titles from the database
function getDatabaseMovies(dbPath) {
  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database(dbPath, sqlite3.OPEN_READONLY, err => {
      if (err) return reject(err);
    });
    db.all('SELECT title FROM movies', [], (err, rows) => {
      db.close();
      if (err) return reject(err);
      resolve(rows.map(r => r.title));
    });
  });
}

(async () => {
  try {
    const files = getMovieFiles(MOVIE_DIR).map(f => path.parse(f).name.toLowerCase());
    const dbMovies = (await getDatabaseMovies(DB_PATH)).map(t => t.toLowerCase());
    const notUploaded = files.filter(f => !dbMovies.includes(f));
    if (notUploaded.length === 0) {
      console.log('All files are uploaded to the database.');
    } else {
      console.log('Files not yet uploaded to the database:');
      notUploaded.forEach(f => console.log(f));
    }
  } catch (err) {
    console.error('Error:', err.message);
  }
})();
