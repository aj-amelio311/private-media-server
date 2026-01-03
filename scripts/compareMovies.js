#!/usr/bin/env node
/**
 * Compare external drive movie files with database entries.
 * Usage: node compareMovies.js /path/to/external/drive
 */
const fs = require('fs');
const path = require('path');
const initSqlJs = require('sql.js');

// Use the main app's database file
const DB_PATH = path.resolve(__dirname, '../data/movies.db');

if (process.argv.length < 3) {
  console.error('Usage: node compareMovies.js /path/to/external/drive');
  process.exit(1);
}

const MOVIE_DIR = process.argv[2];

// 1. Read all movie files from the external drive folder
function getMovieFiles(dir) {
  return fs.readdirSync(dir)
    .filter(f => !f.startsWith('.')) // Exclude hidden files
    .filter(f => f.match(/\.(mp4|mkv|avi|mov)$/i))
    .map(f => ({
      name: path.parse(f).name.toLowerCase(),
      size: fs.statSync(path.join(dir, f)).size,
      original: f
    }));
}


// 2. Get all movie titles from the database using sql.js
async function getDatabaseMovies(dbPath) {
  const SQL = await initSqlJs();
  const fileBuffer = fs.readFileSync(dbPath);
  const db = new SQL.Database(fileBuffer);
  const stmt = db.prepare('SELECT title FROM movies');
  const titles = [];
  while (stmt.step()) {
    const row = stmt.getAsObject();
    titles.push(row.title);
  }
  stmt.free();
  db.close && db.close();
  return titles;
}



(async () => {
  try {
    const files = getMovieFiles(MOVIE_DIR);
    const dbMovies = (await getDatabaseMovies(DB_PATH)).map(t => t.toLowerCase());

    // Only keep files not in DB
    const notUploaded = files.filter(f => !dbMovies.includes(f.name));
    if (notUploaded.length === 0) {
      console.log('All files are uploaded to the database.');
    } else {
      // Sort by size (smallest to largest)
      notUploaded.sort((a, b) => a.size - b.size);
      console.log('Files not yet uploaded to the database (sorted by size):');
      notUploaded.forEach(f => console.log(`${f.original} (${(f.size/1024/1024).toFixed(2)} MB)`));
      const outputLines = notUploaded.map(f => `${f.original} (${(f.size/1024/1024).toFixed(2)} MB)`);
      outputLines.push(notUploaded.length + ' files not uploaded.');
      // Write to a text file
      const outputPath = path.resolve(process.cwd(), 'not_uploaded.txt');
      fs.writeFileSync(outputPath, outputLines.join('\n'), 'utf8');
      console.log(`\nList written to: ${outputPath}`);
    }
  } catch (err) {
    console.error('Error:', err.message);
  }
})();
