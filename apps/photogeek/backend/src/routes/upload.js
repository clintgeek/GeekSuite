const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const upload = require('../middleware/upload');
const { uploadFile } = require('../controllers/uploadController');

// Protect all upload routes
router.use(protect);

// Single file upload
// 'photo' is the field name expected in the form-data
router.post('/', upload.single('photo'), uploadFile);

module.exports = router;
