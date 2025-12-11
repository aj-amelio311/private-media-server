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
const getMPAA = require('../utils/getMPAA');

const BASE_DIR = process.env.MOVIES_DIR || '/Volumes/External/Streaming/movies/';

// Use memory storage - don't save uploaded files to disk
const storage = multer.memoryStorage();

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
        } else {
          // First upload - do the full HLS conversion
          console.log(`[Upload] First upload for "${name}" - performing HLS conversion`);
          // Write file to temp location for ffmpeg processing
          const tempPath = path.join(BASE_DIR, `temp_${Date.now()}_${file.originalname}`);
          // Write buffer to temp file
          await fsp.writeFile(tempPath, file.buffer);
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
          // Send completion
          const sender = progressTrackers.get(file.originalname);
          if (sender) {
            sender(100);
          }
        }
        // Get movie info and save to database
        let info = null;
        let cast = [];
        try {
          const uploadAttempts = getUploadCount(name);
          console.log(`[Upload] Upload attempts for "${name}": ${uploadAttempts}`);
          const resultIndex = uploadAttempts;
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
            mpaa: mpaa
          });
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
            mpaa: null
          });
          await incrementUploadAttempts(name);
          results.push({
            title: name,
            success: false,
            error: infoErr.message,
            info: null
          });
          console.log(`[Upload] Fallback: minimal movie row inserted for ${name}`);
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
