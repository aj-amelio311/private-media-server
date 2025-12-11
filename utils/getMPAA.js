
let fetch;
async function getFetch() {
  if (!fetch) {
    fetch = (await import('node-fetch')).default;
  }
  return fetch;
}
const TMDB_API_KEY = process.env.TMDB_API_KEY;


async function getMPAA(tmdbId) {
  const url = `https://api.themoviedb.org/3/movie/${tmdbId}/release_dates?api_key=${TMDB_API_KEY}`;
  try {
    const fetchFn = await getFetch();
    const res = await fetchFn(url);
    const data = await res.json();
    const us = data.results && data.results.find(r => r.iso_3166_1 === "US");
    if (!us || !us.release_dates) return null;
    const rated = us.release_dates.find(entry => entry.certification);
    return rated ? rated.certification : null;
  } catch (err) {
    console.error(`[getMPAA] Error fetching for TMDB ID ${tmdbId}:`, err.message);
    return null;
  }
}

module.exports = getMPAA;
