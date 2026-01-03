const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const fsp = fs.promises;
const multer = require('multer');
const buildHLS = require('../utils/buildHLS');
const getMovieInfo = require('../utils/getMovieInfo');
const getMovieCast = require('../utils/getMovieCast');
const { insertMovie, getUploadCount, incrementUploadAttempts } = require('../utils/database');
const { getEmbedding } = require('../utils/getEmbedding.js');
const { getMovieKeywords } = require('../utils/getMovieKeywords');
const getMPAA = require('../utils/getMPAA');

const BASE_DIR = process.env.MOVIES_DIR || '/Volumes/External/Streaming/movies/';

// Use disk storage for all uploads - safe for large files
const uploadDir = path.join(__dirname, '../uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir);
}
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    // Use original filename
    cb(null, file.originalname);
  }
});

const upload = multer({ storage });

// Track conversion progress for SSE
const progressTrackers = new Map();
const activeConversions = new Map(); // Track background conversions

// SSE endpoint for progress updates
router.get('/progress/:filename', (req, res) => {
  const { filename } = req.params;
  
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  const sendProgress = (progress) => {
    res.write(`data: ${JSON.stringify({ progress })}\n\n`);
  };

  progressTrackers.set(filename, sendProgress);

  req.on('close', () => {
    progressTrackers.delete(filename);
  });
});

// POST endpoint - accept files, save to uploads/, build HLS in test_movie/
router.post('/', upload.array('movies', 25), async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: 'No files uploaded' });
    }

    console.log(`[Upload] Received ${req.files.length} files`);

    const results = [];
    
    for (const file of req.files) {
      const { name } = path.parse(file.originalname);
      const hlsDir = path.join(BASE_DIR, `${name}_hls`);
      // Accept tmdbIndex from request body (for re-upload UI)
      const tmdbIndex = req.body.tmdbIndex !== undefined ? parseInt(req.body.tmdbIndex) : undefined;
      console.log(`[Upload] Processing: ${file.originalname}`);
      console.log(`[Upload] File size: ${file.size} bytes`);

      try {
        // Check if this is a re-upload (HLS directory already exists)
        const isReupload = await fsp.access(hlsDir).then(() => true).catch(() => false);

        if (isReupload) {
          console.log(`[Upload] Re-upload detected for "${name}" - skipping HLS conversion`);
          // Send 100% progress immediately for re-uploads
          const sender = progressTrackers.get(file.originalname);
          if (sender) {
            sender(100);
          }
          // For re-uploads, update metadata only, do NOT increment upload_attempts
          let info = null;
          let cast = [];
          try {
            const uploadAttempts = getUploadCount(name);
            console.log(`[Upload] Upload attempts for "${name}": ${uploadAttempts}`);
            const resultIndex = tmdbIndex !== undefined ? tmdbIndex : uploadAttempts;
            console.log(`[Upload] Using TMDB result index ${resultIndex} for "${name}"`);
            info = await getMovieInfo(BASE_DIR, name, resultIndex);
            if (info && info.id) {
              cast = await getMovieCast(info.id);
            }
            let mpaa = null;
            if (info && info.id) {
              try {
                mpaa = await getMPAA(info.id);
                if (mpaa) {
                  console.log(`[Upload] MPAA for ${name}: ${mpaa}`);
                }
              } catch (mpaaErr) {
                console.warn(`[Upload] Could not fetch MPAA for ${name}:`, mpaaErr.message);
              }
            }
            let keywords = [];
            if (info && info.id) {
              keywords = await getMovieKeywords(info.id);
            }
            await insertMovie({
              id: info.id || Math.floor(Math.random() * 1000000),
              title: name,
              original_title: info.original_title || name,
              original_language: info.original_language || 'en',
              overview: info.overview || '',
              poster_path: info.poster_path || '',
              release_date: info.release_date || '',
              vote_average: info.vote_average || 0,
              vote_count: info.vote_count || 0,
              popularity: info.popularity || 0,
              genre_ids: info.genre_ids || [],
              cast: cast,
              director: info.director || null,
              mpaa: mpaa,
              keywords: keywords,
              tagline: info.tagline || null,
              belongs_to_collection: info.belongs_to_collection || null,
              production_companies: info.production_companies || null,
              production_countries: info.production_countries || null,
              spoken_languages: info.spoken_languages || null,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString()
            });
            console.log(`[Upload] Movie info updated in database (re-upload): ${name}`);
            results.push({
              title: name,
              success: true,
              info
            });
            console.log(`[Upload] Success (re-upload): ${name}`);
          } catch (infoErr) {
            console.warn(`[Upload] Could not update info for ${name}:`, infoErr.message);
            // Fallback: update minimal movie row, do NOT increment upload_attempts
            await insertMovie({
              id: Math.floor(Math.random() * 1000000),
              title: name,
              original_title: name,
              original_language: 'en',
              overview: '',
              poster_path: '',
              release_date: '',
              vote_average: 0,
              vote_count: 0,
              popularity: 0,
              genre_ids: [],
              cast: [],
              director: null,
              mpaa: null,
              keywords: [],
              tagline: null,
              belongs_to_collection: null,
              production_companies: null,
              production_countries: null,
              spoken_languages: null,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString()
            });
            results.push({
              title: name,
              success: false,
              error: infoErr.message,
              info: null
            });
            console.log(`[Upload] Fallback: minimal movie row updated for ${name}`);
          }
        } else {
          // First upload - do the full HLS conversion
          console.log(`[Upload] First upload for "${name}" - performing HLS conversion`);
          // Write file to temp location for ffmpeg processing
          const tempPath = path.join(BASE_DIR, `temp_${Date.now()}_${file.originalname}`);
          // Copy uploaded file from disk to temp location for ffmpeg processing
          await fsp.copyFile(file.path, tempPath);
          await fsp.mkdir(hlsDir, { recursive: true });
          const progressCallback = (progress) => {
            const sender = progressTrackers.get(file.originalname);
            if (sender) {
              sender(progress);
            }
          };
          await buildHLS(tempPath, hlsDir, progressCallback);
          // Delete temp file after conversion
          await fsp.unlink(tempPath);
          // Schedule a background check for playlist.m3u8 every minute
          const m3u8Path = path.join(hlsDir, 'playlist.m3u8');
              // After all processing, send 'done' alert and delete upload file
              for (const file of req.files) {
                const sender = progressTrackers.get(file.originalname);
                if (sender) {
                  sender(100);
                }
                try {
                  await fsp.unlink(file.path);
                  console.log(`[Upload] Deleted uploaded file from uploads/: ${file.path}`);
                } catch (delErr) {
                  console.warn(`[Upload] Could not delete uploaded file: ${file.path}`, delErr.message);
                }
              }
          // Only increment upload_attempts for true uploads
          let info = null;
          let cast = [];
          try {
            const uploadAttempts = getUploadCount(name);
            console.log(`[Upload] Upload attempts for "${name}": ${uploadAttempts}`);
            const resultIndex = tmdbIndex !== undefined ? tmdbIndex : uploadAttempts;
            console.log(`[Upload] Using TMDB result index ${resultIndex} for "${name}"`);
            info = await getMovieInfo(BASE_DIR, name, resultIndex);
            if (info && info.id) {
              cast = await getMovieCast(info.id);
            }
            let mpaa = null;
            if (info && info.id) {
              try {
                mpaa = await getMPAA(info.id);
                if (mpaa) {
                  console.log(`[Upload] MPAA for ${name}: ${mpaa}`);
                }
              } catch (mpaaErr) {
                console.warn(`[Upload] Could not fetch MPAA for ${name}:`, mpaaErr.message);
              }
            }
            let keywords2 = [];
            if (info && info.id) {
              keywords2 = await getMovieKeywords(info.id);
            }
            await insertMovie({
              id: info.id || Math.floor(Math.random() * 1000000),
              title: name,
              original_title: info.original_title || name,
              original_language: info.original_language || 'en',
              overview: info.overview || '',
              poster_path: info.poster_path || '',
              release_date: info.release_date || '',
              vote_average: info.vote_average || 0,
              vote_count: info.vote_count || 0,
              popularity: info.popularity || 0,
              genre_ids: info.genre_ids || [],
              cast: cast,
              director: info.director || null,
              mpaa: mpaa,
              keywords: keywords2,
              tagline: info.tagline || null,
              belongs_to_collection: info.belongs_to_collection || null,
              production_companies: info.production_companies || null,
              production_countries: info.production_countries || null,
              spoken_languages: info.spoken_languages || null,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString()
            });
            // Generate and save embedding immediately after insert
            (async () => {
              try {
                if (!process.env.OPENAI_API_KEY) {
                  console.warn('[Embedding] Skipping embedding: OPENAI_API_KEY not set.');
                  return;
                }
                const genres = info.genre_ids || [];
                const keywords = keywords2 || [];
                const year = info.release_date && typeof info.release_date === 'string' && info.release_date.includes('-')
                  ? info.release_date.split('-')[0]
                  : (info.release_date || 'Unknown Year');
                const text = [
                  `${info.title}${info.original_title && info.original_title !== info.title ? ` (Original title: ${info.original_title})` : ''}.`,
                  info.tagline ? `Tagline: ${info.tagline}.` : '',
                  info.overview ? `Overview: ${info.overview}` : '',
                  genres.length ? `Genres: ${genres.join(', ')}.` : '',
                  keywords.length ? `Keywords: ${keywords.join(', ')}.` : '',
                  info.mpaa ? `MPAA Rating: ${info.mpaa}.` : '',
                  typeof info.vote_average === 'number' ? `Average rating: ${info.vote_average}.` : '',
                  typeof info.vote_count === 'number' ? `Vote count: ${info.vote_count}.` : '',
                  year ? `Release year: ${year}.` : '',
                  info.belongs_to_collection && info.belongs_to_collection.name ? `Part of collection: ${info.belongs_to_collection.name}.` : '',
                  info.production_companies && info.production_companies.length ? `Production companies: ${info.production_companies.map(c => c.name).filter(Boolean).join(', ')}.` : '',
                  info.production_countries && info.production_countries.length ? `Production countries: ${info.production_countries.map(c => c.name).filter(Boolean).join(', ')}.` : '',
                  info.spoken_languages && info.spoken_languages.length ? `Spoken languages: ${info.spoken_languages.map(l => l.english_name || l.name).filter(Boolean).join(', ')}.` : ''
                ].filter(Boolean).join(' ');
                let embedding = null;
                try {
                  embedding = await getEmbedding(text);
                } catch (embedErr) {
                  console.warn(`[Upload] Embedding API call failed for ${name}:`, embedErr.message || embedErr);
                }
                if (embedding) {
                  const db = require('../utils/database').getDatabase();
                  const updateStmt = db.prepare('UPDATE movies SET embedding = ? WHERE title = ?');
                  updateStmt.run([JSON.stringify(embedding), name]);
                  updateStmt.free();
                  require('../utils/database').saveDatabase();
                  console.log(`[Upload] Embedding generated and saved for: ${name}`);
                } else {
                  console.warn(`[Upload] No embedding generated for ${name}.`);
                }
              } catch (embedErr) {
                console.warn(`[Upload] Embedding outer error for ${name}:`, embedErr.message || embedErr);
              }
            })();
            await incrementUploadAttempts(name);
            console.log(`[Upload] Movie info saved to database: ${name}`);
            results.push({
              title: name,
              success: true,
              info
            });
            console.log(`[Upload] Success: ${name}`);
          } catch (infoErr) {
            console.warn(`[Upload] Could not get/save info for ${name}:`, infoErr.message);
            // Fallback: insert minimal movie row and increment upload_attempts
            await insertMovie({
              id: Math.floor(Math.random() * 1000000),
              title: name,
              original_title: name,
              original_language: 'en',
              overview: '',
              poster_path: '',
              release_date: '',
              vote_average: 0,
              vote_count: 0,
              popularity: 0,
              genre_ids: [],
              cast: [],
              director: null,
              mpaa: null,
              keywords: [],
              tagline: null,
              belongs_to_collection: null,
              production_companies: null,
              production_countries: null,
              spoken_languages: null,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString()
            });
            // Generate and save embedding for fallback row
            (async () => {
              try {
                if (!process.env.OPENAI_API_KEY) {
                  console.warn('[Embedding] Skipping embedding: OPENAI_API_KEY not set.');
                  return;
                }
                const text = `${name}.`;
                let embedding = null;
                try {
                  embedding = await getEmbedding(text);
                } catch (embedErr) {
                  console.warn(`[Upload] Embedding API call failed for fallback ${name}:`, embedErr.message || embedErr);
                }
                if (embedding) {
                  const db = require('../utils/database').getDatabase();
                  const updateStmt = db.prepare('UPDATE movies SET embedding = ? WHERE title = ?');
                  updateStmt.run([JSON.stringify(embedding), name]);
                  updateStmt.free();
                  require('../utils/database').saveDatabase();
                  console.log(`[Upload] Embedding generated and saved for fallback: ${name}`);
                } else {
                  console.warn(`[Upload] No embedding generated for fallback ${name}.`);
                }
              } catch (embedErr) {
                console.warn(`[Upload] Embedding outer error for fallback ${name}:`, embedErr.message || embedErr);
              }
            })();
            await incrementUploadAttempts(name);
            results.push({
              title: name,
              success: false,
              error: infoErr.message,
              info: null
            });
            console.log(`[Upload] Fallback: minimal movie row inserted for ${name}`);
          }
        }
      } catch (err) {
        console.error(`[Upload] Failed: ${name}`, err.message);
        results.push({
          title: name,
          success: false,
          error: err.message
        });
      }
    }

    return res.json({ results });
  } catch (err) {
    console.error('[Upload] Error:', err);
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;
