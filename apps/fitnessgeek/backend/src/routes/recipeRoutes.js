const express = require('express');
const router = express.Router();

/**
 * @route GET /api/recipes
 * @desc Get user's recipes
 * @access Private
 */
router.get('/', (req, res) => {
  res.json({
    success: true,
    message: 'Recipes endpoint - coming soon',
    timestamp: new Date().toISOString()
  });
});

module.exports = router;