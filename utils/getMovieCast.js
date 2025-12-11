const axios = require('axios');

async function getMovieCast(movieId) {
  if (!movieId) {
    console.warn('No movie ID provided for cast lookup');
    return [];
  }

  const apiKey = process.env.TMDB_API_KEY || 'PLACEHOLDER_API_KEY';
  const url = `https://api.themoviedb.org/3/movie/${movieId}/credits`;
  
  try {
    const resp = await axios.get(url, {
      params: { api_key: apiKey },
      timeout: 5000,
    });
    
    // Return top 10 cast members with relevant info
    const cast = resp.data.cast || [];
    return cast.slice(0, 10).map(member => ({
      id: member.id,
      name: member.name,
      character: member.character,
      profile_path: member.profile_path,
      order: member.order
    }));
  } catch (e) {
    console.error('TMDB cast lookup failed:', e && e.message ? e.message : String(e));
    return [];
  }
}

module.exports = getMovieCast;
