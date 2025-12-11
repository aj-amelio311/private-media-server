const express = require('express');
const router = express.Router();
const { getDatabase } = require('../utils/database');

router.get('/', (req, res) => {
  try {
    const db = getDatabase();
    const stmt = db.prepare('SELECT title FROM movies');
    const titles = [];
    
    while (stmt.step()) {
      const row = stmt.getAsObject();
      titles.push(row.title);
    }
    
    stmt.free();
    
    console.log(`[GetAllTitles] Returning ${titles.length} movie titles`);
    res.json({ titles });
  } catch (err) {
    console.error('[GetAllTitles] Error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
