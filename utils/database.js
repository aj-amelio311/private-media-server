// Returns a random movie from the database
function getRandomMovie() {
  const db = getDatabase();
  const stmt = db.prepare('SELECT * FROM movies ORDER BY RANDOM() LIMIT 1');
  let movie = null;
  if (stmt.step()) {
    const row = stmt.getAsObject();
    movie = {
      ...row,
      genre_ids: JSON.parse(row.genre_ids || '[]'),
      cast: JSON.parse(row.cast || '[]')
    };
  }
  stmt.free();
  return movie;
}
function getMovieByTitle(title) {
  const db = getDatabase();
  const stmt = db.prepare('SELECT * FROM movies WHERE title = ?');
  stmt.bind([title]);
  let movie = null;
  if (stmt.step()) {
    const row = stmt.getAsObject();
    movie = {
      ...row,
      genre_ids: JSON.parse(row.genre_ids || '[]'),
      cast: JSON.parse(row.cast || '[]')
    };
  }
  stmt.free();
  return movie;
}
function getAllMovies({ page = 1, limit = 50, search = '', genre = 'All', decade = 'All Decades' } = {}) {
  const db = getDatabase();
  let results = [];
  let offset = (page - 1) * limit;
  try {
    // If searching, use LIKE on title and overview
    if (search && search.trim()) {
      let query = `SELECT title, poster_path, genre_ids, id, release_date, in_queue, director, overview, "cast", upload_attempts, mpaa, keywords FROM movies WHERE (
        title LIKE ? OR
        overview LIKE ? OR
        director LIKE ? OR
        "cast" LIKE ? OR
        keywords LIKE ?
      )`;
      let params = [
        `%${search}%`,
        `%${search}%`,
        `%${search}%`,
        `%${search}%`,
        `%${search}%`
      ];
      if (genre && genre !== 'All' && genre !== 'All Genres') {
        query += ' AND genre_ids LIKE ?';
        params.push(`%${genre}%`);
      }
      if (decade && decade !== 'All Decades') {
        // Decade format: '1980s' => 1980-1989
        const startYear = parseInt(decade.slice(0, 4));
        const endYear = startYear + 9;
        query += ' AND release_date >= ? AND release_date <= ?';
        params.push(`${startYear}-01-01`, `${endYear}-12-31`);
      }
      query += ' ORDER BY title LIMIT ? OFFSET ?';
      params.push(limit, offset);
      const stmt = db.prepare(query);
      stmt.bind(params);
      while (stmt.step()) {
        const row = stmt.getAsObject();
        results.push({
          ...row,
          genre_ids: JSON.parse(row.genre_ids || '[]'),
          cast: JSON.parse(row.cast || '[]'),
          keywords: row.keywords ? JSON.parse(row.keywords) : []
        });
      }
      stmt.free();
      // Get total count
      let countQuery = `SELECT COUNT(*) as total FROM movies WHERE (
        title LIKE ? OR
        overview LIKE ? OR
        director LIKE ? OR
        "cast" LIKE ? OR
        keywords LIKE ?
      )`;
      let countParams = [
        `%${search}%`,
        `%${search}%`,
        `%${search}%`,
        `%${search}%`,
        `%${search}%`
      ];
      if (genre && genre !== 'All' && genre !== 'All Genres') {
        countQuery += ' AND genre_ids LIKE ?';
        countParams.push(`%${genre}%`);
      }
      if (decade && decade !== 'All Decades') {
        const startYear = parseInt(decade.slice(0, 4));
        const endYear = startYear + 9;
        countQuery += ' AND release_date >= ? AND release_date <= ?';
        countParams.push(`${startYear}-01-01`, `${endYear}-12-31`);
      }
      const countStmt = db.prepare(countQuery);
      countStmt.bind(countParams);
      let total = 0;
      if (countStmt.step()) {
        total = countStmt.getAsObject().total;
      }
      countStmt.free();
      return {
        movies: results,
        total,
        page,
        limit,
        hasMore: offset + results.length < total
      };
    }
    // Regular paginated query for browsing (no search)
    let query = 'SELECT title, poster_path, genre_ids, id, release_date, in_queue, director, overview, "cast", upload_attempts, mpaa, keywords, embedding FROM movies';
    let params = [];
    let whereClauses = [];
    if (genre && genre !== 'All' && genre !== 'All Genres') {
      whereClauses.push('genre_ids LIKE ?');
      params.push(`%${genre}%`);
    }
    if (decade && decade !== 'All Decades') {
      const startYear = parseInt(decade.slice(0, 4));
      const endYear = startYear + 9;
      whereClauses.push('release_date >= ? AND release_date <= ?');
      params.push(`${startYear}-01-01`, `${endYear}-12-31`);
    }
    if (whereClauses.length > 0) {
      query += ' WHERE ' + whereClauses.join(' AND ');
    }
    query += ' ORDER BY title LIMIT ? OFFSET ?';
    params.push(limit, offset);
    const stmt = db.prepare(query);
    stmt.bind(params);
    while (stmt.step()) {
      const row = stmt.getAsObject();
      results.push({
        ...row,
        genre_ids: JSON.parse(row.genre_ids || '[]'),
        cast: JSON.parse(row.cast || '[]'),
        keywords: row.keywords ? JSON.parse(row.keywords) : [],
        embedding: row.embedding ? JSON.parse(row.embedding) : null
      });
    }
    stmt.free();
    // Get total count
    let countQuery = 'SELECT COUNT(*) as total FROM movies';
    let countParams = [];
    if (whereClauses.length > 0) {
      countQuery += ' WHERE ' + whereClauses.join(' AND ');
      countParams = params.slice(0, params.length - 2); // exclude limit/offset
    }
    const countStmt = db.prepare(countQuery);
    if (countParams.length > 0) {
      countStmt.bind(countParams);
    }
    let total = 0;
    if (countStmt.step()) {
      total = countStmt.getAsObject().total;
    }
    countStmt.free();
    return {
      movies: results,
      total,
      page,
      limit,
      hasMore: offset + results.length < total
    };
  } catch (err) {
    console.error('[Database] Error fetching movies:', err.message);
    return {
      movies: [],
      total: 0,
      page: 1,
      limit: 50,
      hasMore: false
    };
  }
}
const fs = require('fs');
const path = require('path');
const initSqlJs = require('sql.js');
const { TMDB_GENRES } = require('./genremap');

const DB_PATH = path.join(__dirname, '../data/movies.db');

let db = null;
let saveTimer = null;
// All writes are synchronous in-memory. No async queue.

async function initDatabase() {
  const SQL = await initSqlJs();
  
  // Load existing database or create new one
  if (fs.existsSync(DB_PATH)) {
    const buffer = fs.readFileSync(DB_PATH);
    db = new SQL.Database(buffer);
    console.log('[Database] Loaded existing database');
    
    // Check if cast column exists, if not add it
    try {
      const result = db.exec("PRAGMA table_info(movies)");
      const columns = result[0]?.values.map(row => row[1]) || [];
      
      if (!columns.includes('cast')) {
        console.log('[Database] Adding cast column to existing table');
        db.run("ALTER TABLE movies ADD COLUMN cast TEXT");
        saveDatabase();
        console.log('[Database] Cast column added');
      }
      
      if (!columns.includes('upload_attempts')) {
        console.log('[Database] Adding upload_attempts column to existing table');
        db.run("ALTER TABLE movies ADD COLUMN upload_attempts INTEGER DEFAULT 0");
        saveDatabase();
        console.log('[Database] Upload attempts column added');
      }
      
      if (!columns.includes('director')) {
        console.log('[Database] Adding director column to existing table');
        db.run("ALTER TABLE movies ADD COLUMN director TEXT");
        saveDatabase();
        console.log('[Database] Director column added');
      }
      
      if (!columns.includes('mpaa')) {
        console.log('[Database] Adding mpaa column to existing table');
        db.run("ALTER TABLE movies ADD COLUMN mpaa TEXT");
        saveDatabase();
        console.log('[Database] mpaa column added');
      }

      if (!columns.includes('embedding')) {
        console.log('[Database] Adding embedding column to existing table');
        db.run("ALTER TABLE movies ADD COLUMN embedding TEXT");
        saveDatabase();
        console.log('[Database] Embedding column added');
      }
      
      // Create indexes for better query performance
      console.log('[Database] Creating indexes for performance...');
      db.run("CREATE INDEX IF NOT EXISTS idx_title ON movies(title)");
      db.run("CREATE INDEX IF NOT EXISTS idx_in_queue ON movies(in_queue)");
      db.run("CREATE INDEX IF NOT EXISTS idx_created_at ON movies(created_at)");
      saveDatabase();
      console.log('[Database] Indexes created');
    } catch (err) {
      console.error('[Database] Error checking/adding columns:', err);
    }
  } else {
    db = new SQL.Database();
    console.log('[Database] Created new database');
    
    // Create movies table
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
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    saveDatabase();
    console.log('[Database] Movies table created');
  }
  
  return db;
}

function saveDatabase() {
  if (!db) return;
  const data = db.export();
  const buffer = Buffer.from(data);
  return new Promise((resolve, reject) => {
    fs.writeFile(DB_PATH, buffer, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

function getDatabase() {
  if (!db) {
    throw new Error('Database not initialized. Call initDatabase() first.');
  }
  return db;
}

async function insertMovie(movieData) {
  const db = getDatabase();
  // Convert genre IDs to genre names
  const genreNames = (movieData.genre_ids || [])
    .map(id => TMDB_GENRES[id])
    .filter(Boolean);

  // Remove embedding logic from insertMovie
  // Only insert metadata, not embedding
  const stmt = db.prepare(`
    INSERT INTO movies 
    (id, title, original_title, original_language, overview, poster_path, 
     release_date, vote_average, vote_count, popularity, genre_ids, cast, director, mpaa, updated_at, upload_attempts)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, COALESCE((SELECT upload_attempts FROM movies WHERE title = ?), 0))
    ON CONFLICT(title) DO UPDATE SET
      original_title = excluded.original_title,
      original_language = excluded.original_language,
      overview = excluded.overview,
      poster_path = excluded.poster_path,
      release_date = excluded.release_date,
      vote_average = excluded.vote_average,
      vote_count = excluded.vote_count,
      popularity = excluded.popularity,
      genre_ids = excluded.genre_ids,
      cast = excluded.cast,
      director = excluded.director,
      mpaa = excluded.mpaa,
      updated_at = CURRENT_TIMESTAMP,
      upload_attempts = movies.upload_attempts
  `);
  stmt.run([
    movieData.id,
    movieData.title,
    movieData.original_title,
    movieData.original_language,
    movieData.overview,
    movieData.poster_path,
    movieData.release_date,
    movieData.vote_average,
    movieData.vote_count,
    movieData.popularity,
    JSON.stringify(genreNames),
    JSON.stringify(movieData.cast || []),
    movieData.director || null,
    movieData.mpaa || null,
    movieData.title // for COALESCE upload_attempts
  ]);
  stmt.free();
  saveDatabase();

  // Log upload_attempts after upsert
  const after = db.prepare('SELECT upload_attempts FROM movies WHERE title = ?');
  after.bind([movieData.title]);
  let afterAttempts = null;
  if (after.step()) {
    afterAttempts = after.getAsObject().upload_attempts;
  }
  after.free();
  console.log(`[Database] AFTER upsert: upload_attempts for ${movieData.title}:`, afterAttempts);
  console.log(`[Database] Inserted/Updated movie: ${movieData.title}`);
}
function updateMovieQueue(title, inQueue) {
  const db = getDatabase();
  
  const stmt = db.prepare('UPDATE movies SET in_queue = ?, updated_at = CURRENT_TIMESTAMP WHERE title = ?');
  stmt.run([inQueue ? 1 : 0, title]);
  stmt.free();
  saveDatabase();
  
  console.log(`[Database] Updated queue status for ${title}: ${inQueue}`);
}

function getQueueMovies() {
  const db = getDatabase();
  
  const results = [];
  const stmt = db.prepare('SELECT * FROM movies WHERE in_queue = 1 ORDER BY title');
  
  while (stmt.step()) {
    const row = stmt.getAsObject();
    results.push({
      ...row,
      genre_ids: JSON.parse(row.genre_ids || '[]'),
      cast: JSON.parse(row.cast || '[]')
    });
  }
  
  stmt.free();
  return results;
}

function getUploadCount(title) {
  const db = getDatabase();
  
  const stmt = db.prepare('SELECT upload_attempts FROM movies WHERE title = ?');
  stmt.bind([title]);
  
  let attempts = 0;
  if (stmt.step()) {
    const row = stmt.getAsObject();
    attempts = row.upload_attempts || 0;
  }
  
  stmt.free();
  return attempts;
}

async function incrementUploadAttempts(title) {
  const db = getDatabase();
  // Log upload_attempts before increment
  const before = db.prepare('SELECT upload_attempts FROM movies WHERE title = ?');
  before.bind([title]);
  let beforeAttempts = null;
  if (before.step()) {
    beforeAttempts = before.getAsObject().upload_attempts;
  }
  before.free();
  console.log(`[Database] BEFORE increment: upload_attempts for ${title}:`, beforeAttempts);

  const stmt = db.prepare('UPDATE movies SET upload_attempts = upload_attempts + 1, updated_at = CURRENT_TIMESTAMP WHERE title = ?');
  stmt.run([title]);
  stmt.free();
  await saveDatabase();

  // Log upload_attempts after increment
  const after = db.prepare('SELECT upload_attempts FROM movies WHERE title = ?');
  after.bind([title]);
  let afterAttempts = null;
  if (after.step()) {
    afterAttempts = after.getAsObject().upload_attempts;
  }
  after.free();
  console.log(`[Database] AFTER increment: upload_attempts for ${title}:`, afterAttempts);
  console.log(`[Database] Incremented upload attempts for: ${title}`);
}

module.exports = {
  initDatabase,
  getDatabase,
  saveDatabase,
  insertMovie,
  getMovieByTitle,
  getAllMovies,
  updateMovieQueue,
  getQueueMovies,
  getUploadCount,
  incrementUploadAttempts,
  getRandomMovie
};
