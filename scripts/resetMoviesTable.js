// Script to drop and recreate the movies table with the exact schema
// Usage: node scripts/resetMoviesTable.js

const path = require('path');
const fs = require('fs');
const initSqlJs = require('sql.js');

const DB_PATH = path.join(__dirname, '../data/movies.db');

async function main() {
  const SQL = await initSqlJs();
  let db;
  if (fs.existsSync(DB_PATH)) {
    const buffer = fs.readFileSync(DB_PATH);
    db = new SQL.Database(buffer);
    console.log('[Reset] Loaded existing database.');
  } else {
    db = new SQL.Database();
    console.log('[Reset] Created new database.');
  }

  // Drop the movies table if it exists
  db.run('DROP TABLE IF EXISTS movies;');
  console.log('[Reset] Dropped movies table if it existed.');

  // Recreate the movies table with the exact schema
  db.run(`
    CREATE TABLE IF NOT EXISTS movies (
      id INTEGER PRIMARY KEY,
      title TEXT NOT NULL UNIQUE,
      original_title TEXT,
      original_language TEXT,
      overview TEXT,
      poster_path TEXT,
      release_date TEXT,
      vote_average REAL,
      vote_count INTEGER,
      popularity REAL,
      genre_ids TEXT,
      cast TEXT,
      director TEXT,
      mpaa TEXT,
      upload_attempts INTEGER DEFAULT 0,
      in_queue BOOLEAN DEFAULT 0,
      embedding TEXT,
      keywords TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  db.run("CREATE INDEX IF NOT EXISTS idx_title ON movies(title)");
  db.run("CREATE INDEX IF NOT EXISTS idx_in_queue ON movies(in_queue)");
  db.run("CREATE INDEX IF NOT EXISTS idx_created_at ON movies(created_at)");

  // Save DB
  const data = db.export();
  fs.writeFileSync(DB_PATH, Buffer.from(data));
  console.log('[Reset] Movies table and indexes recreated.');
}

main();