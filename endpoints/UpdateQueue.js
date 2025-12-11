const express = require('express');
const router = express.Router();
const { updateMovieQueue } = require('../utils/database');

router.post('/', async (req, res) => {
  try {
    const { title, inQueue } = req.body;
    
    if (!title) {
      return res.status(400).json({ error: 'Title is required' });
    }
    
    updateMovieQueue(title, inQueue);
    
    res.json({ success: true, title, inQueue });
  } catch (err) {
    console.error('[UpdateQueue] Error:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
