const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const fsp = fs.promises;
const { getMovieByTitle } = require('../utils/database');

const BASE_DIR = process.env.MOVIES_DIR || '/Volumes/External/Streaming/movies/';

router.delete('/', async (req, res) => {
  try {
    const { title } = req.body;
    
    if (!title) {
      return res.status(400).json({ error: 'Title is required' });
    }

    console.log(`[DeleteMovie] Deleting: ${title}`);

    // Check if movie exists in database
    const movie = getMovieByTitle(title);
    if (!movie) {
      return res.status(404).json({ error: 'Movie not found in database' });
    }

    // Delete HLS directory
    const hlsDir = path.join(BASE_DIR, `${title}_hls`);
    
    try {
      if (fs.existsSync(hlsDir)) {
        await fsp.rm(hlsDir, { recursive: true, force: true });
        console.log(`[DeleteMovie] Deleted HLS directory: ${hlsDir}`);
      }
    } catch (err) {
      console.error(`[DeleteMovie] Error deleting HLS directory:`, err);
    }

    // Delete from database
    const db = require('../utils/database').getDatabase();
    const stmt = db.prepare('DELETE FROM movies WHERE title = ?');
    stmt.run([title]);
    stmt.free();
    require('../utils/database').saveDatabase();

    console.log(`[DeleteMovie] Deleted from database: ${title}`);

    res.json({ success: true, message: `Movie "${title}" deleted successfully` });
  } catch (err) {
    console.error('[DeleteMovie] Error:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
