// Clears all embedding vectors from the movies table, but keeps the column
function clearAllEmbeddings() {
  const db = getDatabase();
  const stmt = db.prepare('UPDATE movies SET embedding = NULL');
  stmt.run();
  stmt.free();
  saveDatabase();
  console.log('[Database] All movie embeddings cleared.');
}
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
    // If searching, prioritize exact title match, then partial title, then other fields
    if (search && search.trim()) {
      let allResults = [];
      let seenIds = new Set();

      // 1. Exact title match (case-insensitive)
      let query1 = `SELECT title, poster_path, genre_ids, id, release_date, in_queue, director, overview, "cast", upload_attempts, mpaa, keywords FROM movies WHERE LOWER(title) = LOWER(?)`;
      let params1 = [search.trim()];
      if (genre && genre !== 'All' && genre !== 'All Genres') {
        query1 += ' AND genre_ids LIKE ?';
        params1.push(`%${genre}%`);
      }
      if (decade && decade !== 'All Decades') {
        const startYear = parseInt(decade.slice(0, 4));
        const endYear = startYear + 9;
        query1 += ' AND release_date >= ? AND release_date <= ?';
        params1.push(`${startYear}-01-01`, `${endYear}-12-31`);
      }
      const stmt1 = db.prepare(query1);
      stmt1.bind(params1);
      while (stmt1.step()) {
        const row = stmt1.getAsObject();
        allResults.push({
          ...row,
          genre_ids: JSON.parse(row.genre_ids || '[]'),
          cast: JSON.parse(row.cast || '[]'),
          keywords: row.keywords ? JSON.parse(row.keywords) : []
        });
        seenIds.add(row.id);
      }
      stmt1.free();

      // 2. Partial title match (contains, case-insensitive, not exact)
      let query2 = `SELECT title, poster_path, genre_ids, id, release_date, in_queue, director, overview, "cast", upload_attempts, mpaa, keywords FROM movies WHERE LOWER(title) LIKE LOWER(?) AND LOWER(title) != LOWER(?)`;
      let params2 = [`%${search.trim()}%`, search.trim()];
      if (genre && genre !== 'All' && genre !== 'All Genres') {
        query2 += ' AND genre_ids LIKE ?';
        params2.push(`%${genre}%`);
      }
      if (decade && decade !== 'All Decades') {
        const startYear = parseInt(decade.slice(0, 4));
        const endYear = startYear + 9;
        query2 += ' AND release_date >= ? AND release_date <= ?';
        params2.push(`${startYear}-01-01`, `${endYear}-12-31`);
      }
      query2 += ' ORDER BY title';
      const stmt2 = db.prepare(query2);
      stmt2.bind(params2);
      while (stmt2.step()) {
        const row = stmt2.getAsObject();
        if (!seenIds.has(row.id)) {
          allResults.push({
            ...row,
            genre_ids: JSON.parse(row.genre_ids || '[]'),
            cast: JSON.parse(row.cast || '[]'),
            keywords: row.keywords ? JSON.parse(row.keywords) : []
          });
          seenIds.add(row.id);
        }
      }
      stmt2.free();

      // 3. Other fields (overview, director, cast, keywords), not already included
      let query3 = `SELECT title, poster_path, genre_ids, id, release_date, in_queue, director, overview, "cast", upload_attempts, mpaa, keywords FROM movies WHERE (
        overview LIKE ? OR
        director LIKE ? OR
        "cast" LIKE ? OR
        keywords LIKE ?
      )`;
      let params3 = [
        `%${search}%`,
        `%${search}%`,
        `%${search}%`,
        `%${search}%`
      ];
      if (genre && genre !== 'All' && genre !== 'All Genres') {
        query3 += ' AND genre_ids LIKE ?';
        params3.push(`%${genre}%`);
      }
      if (decade && decade !== 'All Decades') {
        const startYear = parseInt(decade.slice(0, 4));
        const endYear = startYear + 9;
        query3 += ' AND release_date >= ? AND release_date <= ?';
        params3.push(`${startYear}-01-01`, `${endYear}-12-31`);
      }
      query3 += ' ORDER BY title';
      const stmt3 = db.prepare(query3);
      stmt3.bind(params3);
      while (stmt3.step()) {
        const row = stmt3.getAsObject();
        if (!seenIds.has(row.id)) {
          allResults.push({
            ...row,
            genre_ids: JSON.parse(row.genre_ids || '[]'),
            cast: JSON.parse(row.cast || '[]'),
            keywords: row.keywords ? JSON.parse(row.keywords) : []
          });
          seenIds.add(row.id);
        }
      }
      stmt3.free();

      // Pagination
      const pagedResults = allResults.slice(offset, offset + limit);

      // Get total count (matches all three queries)
      let count = allResults.length;

      return {
        movies: pagedResults,
        total: count,
        page,
        limit,
        hasMore: offset + pagedResults.length < count
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
    query += ` ORDER BY LOWER(
      CASE
        WHEN LOWER(title) LIKE 'the %' THEN SUBSTR(title, 5)
        ELSE title
      END
    ) LIMIT ? OFFSET ?`;
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
      
      if (!columns.includes("tagline")) {
        db.run("ALTER TABLE movies ADD COLUMN tagline TEXT");
      }
      if (!columns.includes("belongs_to_collection")) {
        db.run("ALTER TABLE movies ADD COLUMN belongs_to_collection TEXT");
      }
      if (!columns.includes("production_companies")) {
        db.run("ALTER TABLE movies ADD COLUMN production_companies TEXT");
      }
      if (!columns.includes("production_countries")) {
        db.run("ALTER TABLE movies ADD COLUMN production_countries TEXT");
      }
      if (!columns.includes("spoken_languages")) {
        db.run("ALTER TABLE movies ADD COLUMN spoken_languages TEXT");
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
        keywords TEXT,
        tagline TEXT,
        belongs_to_collection TEXT,
        production_companies TEXT,
        production_countries TEXT,
        spoken_languages TEXT,
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

// Check if a GUID (id) already exists in the database
function doesIdExist(id) {
  const db = getDatabase();
  const stmt = db.prepare('SELECT id FROM movies WHERE id = ?');
  stmt.bind([id]);
  const exists = stmt.step();
  stmt.free();
  return exists;
}

// Generate a unique GUID that doesn't exist in the database
function generateUniqueId() {
  let newId;
  do {
    newId = Math.floor(Math.random() * 10000000);
  } while (doesIdExist(newId));
  return newId;
}

async function insertMovie(movieData) {
  const db = getDatabase();
  
  // Check for GUID collision and generate a new one if needed
  let finalId = movieData.id;
  if (doesIdExist(finalId)) {
    console.log(`[Database] GUID collision detected for id ${finalId}. Generating new unique GUID...`);
    finalId = generateUniqueId();
    console.log(`[Database] Using new GUID ${finalId} for movie: ${movieData.title}`);
  }
  
  // Convert genre IDs to genre names
  const genreNames = (movieData.genre_ids || [])
    .map(id => TMDB_GENRES[id])
    .filter(Boolean);

  // Remove embedding logic from insertMovie
  // Only insert metadata, not embedding
  const stmt = db.prepare(`
    INSERT INTO movies 
    (id, title, original_title, original_language, overview, poster_path, 
     release_date, vote_average, vote_count, popularity, genre_ids, cast, director, mpaa, upload_attempts, in_queue, embedding, keywords, tagline, belongs_to_collection, production_companies, production_countries, spoken_languages, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
      upload_attempts = excluded.upload_attempts,
      in_queue = excluded.in_queue,
      embedding = excluded.embedding,
      keywords = excluded.keywords,
      tagline = excluded.tagline,
      belongs_to_collection = excluded.belongs_to_collection,
      production_companies = excluded.production_companies,
      production_countries = excluded.production_countries,
      spoken_languages = excluded.spoken_languages,
      created_at = excluded.created_at,
      updated_at = excluded.updated_at
  `);
  stmt.run([
    finalId,
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
    movieData.upload_attempts ?? 0,
    movieData.in_queue ?? 0,
    movieData.embedding ?? null,
    JSON.stringify(movieData.keywords || []),
    movieData.tagline || null,
    movieData.belongs_to_collection ? JSON.stringify(movieData.belongs_to_collection) : null,
    movieData.production_companies ? JSON.stringify(movieData.production_companies) : null,
    movieData.production_countries ? JSON.stringify(movieData.production_countries) : null,
    movieData.spoken_languages ? JSON.stringify(movieData.spoken_languages) : null,
    movieData.created_at || new Date().toISOString(),
    movieData.updated_at || new Date().toISOString()
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
  const stmt = db.prepare(`SELECT * FROM movies WHERE in_queue = 1 ORDER BY LOWER(
    CASE
      WHEN LOWER(title) LIKE 'the %' THEN SUBSTR(title, 5)
      ELSE title
    END
  )`);
  
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
  ,clearAllEmbeddings
};
