const express = require('express');
const router = express.Router();
const { getAllMovies } = require('../utils/database');

router.get('/', (req, res) => {
  try {
    // Parse pagination and filter parameters
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const search = req.query.search || '';
    const genre = req.query.genre || 'All';
    const decade = req.query.decade || 'All Decades';

    console.log('[GetMovies] Request params:', { page, limit, search, genre, decade });

    // Get paginated and filtered results
    const result = getAllMovies({ page, limit, search, genre, decade });

    console.log('[GetMovies] Result from getAllMovies:', result ? `${result.movies?.length} movies` : 'null/undefined');

    // Handle case where result might be undefined or malformed
    if (!result || !result.movies) {
      console.error('[GetMovies] Invalid result from getAllMovies:', result);
      return res.json({
        movies: [],
        total: 0,
        page: 1,
        limit: 50,
        hasMore: false
      });
    }

    // Transform database format to frontend format
    const formattedMovies = result.movies.map(movie => ({
      title: movie.title,
      poster: movie.poster_path,
      genre: Array.isArray(movie.genre_ids) ? movie.genre_ids.join(', ') : movie.genre_ids,
      id: movie.id,
      release_date: movie.release_date,
      in_queue: movie.in_queue,
      director: movie.director,
      cast: movie.cast,
      overview: movie.overview,
      upload_attempts: movie.upload_attempts
    }));

    console.log('[GetMovies] Sending response with', formattedMovies.length, 'movies');

    // Return paginated response with metadata
    res.json({
      movies: formattedMovies,
      total: result.total,
      page: result.page,
      limit: result.limit,
      hasMore: result.hasMore
    });
  } catch (err) {
    console.error('[GetMovies] Error:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
