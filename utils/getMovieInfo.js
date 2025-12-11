const path = require('path');
const fs = require('fs');
const fsp = fs.promises;
const findMovieByTitle = require('./findMovieByTitle');
const axios = require('axios');

const DEFAULT_BASE = process.env.MOVIES_DIR || '/Volumes/External/Streaming/movies/';

async function searchTMDB(queryTitle) {
  const apiKey = process.env.TMDB_API_KEY || 'PLACEHOLDER_API_KEY';
  const url = 'https://api.themoviedb.org/3/search/movie';
  const resp = await axios.get(url, {
    params: { api_key: apiKey, query: queryTitle, page: 1 },
    timeout: 5000,
  });
  return resp.data;
}

async function getMovieCredits(movieId) {
  const apiKey = process.env.TMDB_API_KEY || 'PLACEHOLDER_API_KEY';
  const url = `https://api.themoviedb.org/3/movie/${movieId}/credits`;
  try {
    const resp = await axios.get(url, {
      params: { api_key: apiKey },
      timeout: 5000,
    });
    return resp.data;
  } catch (e) {
    console.error('TMDB credits fetch failed:', e && e.message ? e.message : String(e));
    return null;
  }
}

async function getMovieInfo(baseDir = DEFAULT_BASE, title, resultIndex = 0) {
  // Just do TMDB search based on title, don't require file to exist
  let tmdb = null;
  try {
    tmdb = await searchTMDB(title);
  } catch (e) {
    console.error('TMDB search failed:', e && e.message ? e.message : String(e));
    return null;
  }

  // Return the result at the specified index (default 0 = first result)
  // If resultIndex is 1 and there are multiple results, use the second one
  let movieData = null;
  if (tmdb && tmdb.results && tmdb.results.length > resultIndex) {
    movieData = tmdb.results[resultIndex];
  } else if (tmdb && tmdb.results && tmdb.results.length) {
    // Fallback to first result if index is out of bounds
    movieData = tmdb.results[0];
  }
  
  // Fetch credits to get director information
  if (movieData && movieData.id) {
    const credits = await getMovieCredits(movieData.id);
    if (credits && credits.crew) {
      const director = credits.crew.find(person => person.job === 'Director');
      movieData.director = director ? director.name : null;
    }
    
    // Also attach cast if available
    if (credits && credits.cast) {
      movieData.cast = credits.cast.slice(0, 10); // Get top 10 cast members
    }
  }
  
  return movieData;
}

module.exports = getMovieInfo;
