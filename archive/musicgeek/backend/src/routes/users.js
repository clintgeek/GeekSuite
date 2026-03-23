const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');
const { authenticate } = require('../middleware/auth');
const { validate, validateParams } = require('../middleware/validation');
const { updateUserSchema, userIdSchema } = require('../validators/userValidators');

// All routes require authentication
router.use(authenticate);

router.get('/:id', validateParams(userIdSchema), userController.getUser);
router.put('/:id', validateParams(userIdSchema), validate(updateUserSchema), userController.updateUser);
router.delete('/:id', validateParams(userIdSchema), userController.deleteUser);

module.exports = router;
