// endpoints/SmartSearch.js
const express = require('express');
const router = express.Router();
const { smartSearchMovies } = require('../utils/smartSearchMovies');

router.get('/api/smart-search', async (req, res) => {
  const query = req.query.query;
  if (!query) return res.status(400).json({ error: 'Missing query parameter' });
  try {
    const results = await smartSearchMovies(query);
    res.json({ movies: results });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
