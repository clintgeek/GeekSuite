const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const {
  startProject,
  getUserProjects,
  getUserProjectStatus,
  submitPhoto,
  chatWithInstructor,
  leaveProject
} = require('../controllers/userProjectController');

// All routes are protected
router.use(protect);

router.post('/start/:projectId', startProject);
router.get('/', getUserProjects);
router.get('/:projectId', getUserProjectStatus);
router.post('/:projectId/submit', submitPhoto);
router.post('/:projectId/chat', chatWithInstructor);
router.delete('/:projectId/leave', leaveProject);

module.exports = router;
