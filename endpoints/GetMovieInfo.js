const express = require("express");
const router = express.Router();
const path = require("path");
const fs = require("fs");
const fsp = require("fs").promises;
const findMovieByTitle = require("../utils/findMovieByTitle");
const axios = require('axios');

const BASE_DIR = process.env.MOVIES_DIR || "/Volumes/External/Streaming/movies/";

// GET /:title  (mounted at /get_movie_info in server.js)
// Returns basic metadata about the source movie and whether a corresponding HLS
// folder and playlist exist yet.
router.get("/:title", async (req, res) => {
  const title = req.params.title;
  try {
    // perform a TMDB search (uses a placeholder API key) via axios
    async function searchTMDB(queryTitle) {
      const apiKey = process.env.TMDB_API_KEY || 'PLACEHOLDER_API_KEY';
      const url = 'https://api.themoviedb.org/3/search/movie';
      const resp = await axios.get(url, {
        params: {
          api_key: apiKey,
          query: queryTitle,
          page: 1,
        },
        timeout: 5000,
      });
      return resp.data;
    }

    let tmdb = null;
    try {
      tmdb = await searchTMDB(title);
    } catch (e) {
      console.error('TMDB search failed:', e && e.message ? e.message : e);
      tmdb = { error: 'TMDB search failed' };
    }
    const moviePath = await findMovieByTitle(BASE_DIR, title);
    if (!moviePath) {
      return res.status(404).json({ found: false, message: "Source movie not found", tmdb });
    }

    const stats = await fsp.stat(moviePath);
    const { name, ext } = path.parse(moviePath);

    const hlsDir = path.join(BASE_DIR, `${name}_hls`);
    const playlistPath = path.join(hlsDir, "playlist.m3u8");

    let hlsExists = false;
    try {
      await fsp.access(playlistPath, fs.constants.R_OK);
      hlsExists = true;
    } catch (e) {
      hlsExists = false;
    }

    return res.json({
      found: true,
      title: name,
      moviePath,
      ext,
      sizeBytes: stats.size,
      hlsExists,
      playlistPath: hlsExists ? `/hls/${encodeURIComponent(name)}_hls/playlist.m3u8` : null,
      //tmdb,
      tmdbTopResult: tmdb && tmdb.results && tmdb.results.length ? tmdb.results[0] : null,
    });
  } catch (err) {
    console.error("GetMovieInfo error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

module.exports = router;
