const express = require('express');
const router = express.Router();
const instrumentController = require('../controllers/instrumentController');
const { authenticate } = require('../middleware/auth');

// Public routes
router.get('/', instrumentController.getAllInstruments);
router.get('/:id', instrumentController.getInstrumentById);
router.get('/:id/tunings', instrumentController.getTuningConfigurations);

// Protected routes - user instruments
router.get('/user/instruments', authenticate, instrumentController.getUserInstruments);
router.post('/user/instruments', authenticate, instrumentController.addUserInstrument);
router.delete(
  '/user/instruments/:instrumentId',
  authenticate,
  instrumentController.removeUserInstrument
);
router.get('/user/active-instrument', authenticate, instrumentController.getActiveInstrument);
router.put('/user/active-instrument', authenticate, instrumentController.setActiveInstrument);

module.exports = router;
