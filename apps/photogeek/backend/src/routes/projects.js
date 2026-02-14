const express = require('express');
const router = express.Router();
const {
  getProjects,
  getProjectById,
  getProjectBySlug,
} = require('../controllers/projectController');

// Get all projects (with optional filters)
router.get('/', getProjects);

// Get project by slug
router.get('/slug/:slug', getProjectBySlug);

// Get project by ID
router.get('/:id', getProjectById);

module.exports = router;
