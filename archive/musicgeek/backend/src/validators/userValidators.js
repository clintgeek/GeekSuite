const Joi = require('joi');

const createUserSchema = Joi.object({
  username: Joi.string().alphanum().min(3).max(30).required().messages({
    'string.alphanum': 'Username must only contain letters and numbers',
    'string.min': 'Username must be at least 3 characters',
    'string.max': 'Username cannot exceed 30 characters',
  }),
  email: Joi.string().email().required().messages({
    'string.email': 'Must be a valid email address',
  }),
  password: Joi.string()
    .min(8)
    .pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .required()
    .messages({
      'string.min': 'Password must be at least 8 characters',
      'string.pattern.base': 'Password must contain uppercase, lowercase, and number',
    }),
  display_name: Joi.string().max(100).allow(''),
});

const updateUserSchema = Joi.object({
  display_name: Joi.string().max(100).allow(''),
  bio: Joi.string().max(500).allow(''),
  avatar_url: Joi.string().uri().allow(''),
  skill_level: Joi.string().valid('beginner', 'intermediate', 'advanced'),
  preferences: Joi.object({
    uiMode: Joi.string().valid('kid', 'adult'),
  }).unknown(true),
}).min(1);

const loginSchema = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().required(),
});

const userIdSchema = Joi.object({
  id: Joi.string()
    .pattern(/^[0-9a-fA-F]{24}$/)
    .required()
    .messages({
      'string.pattern.base': 'Invalid user ID format',
    }),
});

const userIdParamSchema = Joi.object({
  userId: Joi.string()
    .pattern(/^[0-9a-fA-F]{24}$/)
    .required()
    .messages({
      'string.pattern.base': 'Invalid user ID format',
    }),
});

module.exports = {
  createUserSchema,
  updateUserSchema,
  loginSchema,
  userIdSchema,
  userIdParamSchema,
};
