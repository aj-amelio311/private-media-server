const path = require('path');
const fs = require('fs');
const fsp = fs.promises;
const findMovieByTitle = require('./findMovieByTitle');
const buildHLS = require('./buildHLS');

const DEFAULT_BASE = process.env.MOVIES_DIR || '/Volumes/External/Streaming/movies/';

async function buildHlsForTitle(baseDir = DEFAULT_BASE, title) {
  // ensure base exists and is writable
  await fsp.mkdir(baseDir, { recursive: true });
  await fsp.access(baseDir, fs.constants.W_OK);

  const moviePath = await findMovieByTitle(baseDir, title);
  if (!moviePath) return { success: false, error: 'Source movie not found' };

  const { name } = path.parse(moviePath);
  const hlsDir = path.join(baseDir, `${name}_hls`);
  await fsp.mkdir(hlsDir, { recursive: true });

  try {
    await buildHLS(moviePath, hlsDir);
  } catch (err) {
    return { success: false, error: err && err.message ? err.message : String(err) };
  }

  return {
    success: true,
    moviePath,
    name,
    hlsDir,
    playlistPath: path.join(hlsDir, 'playlist.m3u8')
  };
}

module.exports = buildHlsForTitle;
