const express = require('express');
const router = express.Router();
const { getQueueMovies } = require('../utils/database');

router.get('/', async (req, res) => {
  try {
    const movies = getQueueMovies();
    
    // Transform database format to frontend format
    const formattedMovies = movies.map(movie => ({
      title: movie.title,
      poster: movie.poster_path,
      genre: Array.isArray(movie.genre_ids) ? movie.genre_ids.join(', ') : movie.genre_ids,
      id: movie.id,
      original_title: movie.original_title,
      overview: movie.overview,
      release_date: movie.release_date,
      vote_average: movie.vote_average,
      vote_count: movie.vote_count,
      popularity: movie.popularity,
      in_queue: movie.in_queue,
      cast: movie.cast
    }));
    
    res.json(formattedMovies);
  } catch (err) {
    console.error('[GetQueue] Error:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
