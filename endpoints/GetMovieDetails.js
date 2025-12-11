const express = require('express');
const router = express.Router();
const { getMovieByTitle } = require('../utils/database');

router.get('/:title', async (req, res) => {
  try {
    const title = decodeURIComponent(req.params.title);
    const movie = getMovieByTitle(title);
    
    if (!movie) {
      return res.status(404).json({ error: 'Movie not found' });
    }
    
    // Return full movie details with cast and overview
    const formattedMovie = {
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
      cast: movie.cast,
      director: movie.director
        , mpaa: movie.mpaa
    };
    
    res.json(formattedMovie);
  } catch (err) {
    console.error('[GetMovieDetails] Error:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
