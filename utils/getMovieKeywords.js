const axios = require('axios');

async function getMovieKeywords(movieId) {
  const apiKey = process.env.TMDB_API_KEY || 'PLACEHOLDER_API_KEY';
  const url = `https://api.themoviedb.org/3/movie/${movieId}/keywords`;
  try {
    const resp = await axios.get(url, {
      params: { api_key: apiKey },
      timeout: 5000,
    });
    return (resp.data && Array.isArray(resp.data.keywords)) ? resp.data.keywords.map(kw => kw.name) : [];
  } catch (e) {
    console.error(`[getMovieKeywords] Failed for movie ID ${movieId}:`, e.message);
    return [];
  }
}

module.exports = { getMovieKeywords };
