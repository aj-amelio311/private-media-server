const express = require('express');
const router = express.Router();
const { getRandomMovie } = require('../utils/database');

router.get('/', (req, res) => {
  try {
    const movie = getRandomMovie();
    if (!movie) {
      return res.status(404).json({ error: 'No movies found.' });
    }
    res.json({ movie });
  } catch (err) {
    console.error('[Roulette] Error:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
