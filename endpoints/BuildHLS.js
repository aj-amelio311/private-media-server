const express = require("express");
const router = express.Router()
const findMovieByTitle = require("../utils/findMovieByTitle")
const buildHLS = require('../utils/buildHLS');
const fs = require("fs");
const fsp = require("fs").promises;
const path = require("path");

const BASE_DIR = process.env.MOVIES_DIR || "/Volumes/External/Streaming/movies/"

router.get("/build_hls/:title", async (_req, res) => {
      console.log("building HLS files")
      const title = _req.params.title
      console.log(title)
        try {
        // ensure /test_movie exists and is writable
        await fsp.mkdir(BASE_DIR, { recursive: true });
    
        // optionally verify write access
        await fsp.access(BASE_DIR, fs.constants.W_OK);
      
        // your movie file and HLS output
        const moviePath = await findMovieByTitle(BASE_DIR, title);
        if (!moviePath) {
          console.error(`No movie found named "${title}" in ${BASE_DIR}`);
          return res.status(404).send("Source movie not found");
        }
        
        const { name } = path.parse(moviePath); // name w/o extension => used for *_hls folder
        const hlsDir = path.join(BASE_DIR, `${name}_hls`);
        await fsp.mkdir(hlsDir, { recursive: true });
        
        console.log("Building HLS from:", moviePath);
      
        try {
          console.log("Building HLS...");
          await buildHLS(moviePath, hlsDir);
          console.log("✅ HLS build complete");
        } catch (err) {
          console.error("buildHLS failed:", err);
        }
          
        console.log("✅ HLS files written to:", hlsDir);
        console.log('Redirecting to:', `/hls/${name}_hls/playlist.m3u8`);
        return res.redirect(`/hls/${name}_hls/playlist.m3u8`);
      } catch (e) {
        console.error("HLS error:", e);
        res.status(500).send("HLS error");
      }
    });

    module.exports = router;