const Datastore = require('nedb');
const path = require('path');

const dbFile = path.join(__dirname, '..', 'data', 'movies.db');
const db = new Datastore({ filename: dbFile, autoload: true });

function insertMovie(info, cb) {
  const payload = {
    title: info.title || null,
    moviePath: info.moviePath || null,
    ext: info.ext || null,
    sizeBytes: info.sizeBytes || 0,
    hlsExists: info.hlsExists ? 1 : 0,
    playlistPath: info.playlistPath || null,
    tmdb: info.tmdbTopResult || null,
    created_at: new Date().toISOString(),
  };
  db.insert(payload, cb);
}

module.exports = { insertMovie };
