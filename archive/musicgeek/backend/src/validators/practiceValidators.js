const Joi = require('joi');

const createPracticeSessionSchema = Joi.object({
  duration_minutes: Joi.number().integer().min(1).max(1440).required(),
  notes: Joi.string().max(1000).allow(''),
  focused_on: Joi.string().max(200).allow(''),
});

const getPracticeQuerySchema = Joi.object({
  limit: Joi.number().integer().min(1).max(100).default(30),
  offset: Joi.number().integer().min(0).default(0),
  start_date: Joi.date().iso(),
  end_date: Joi.date().iso().min(Joi.ref('start_date')),
});

const sessionIdSchema = Joi.object({
  id: Joi.string()
    .pattern(/^[0-9a-fA-F]{24}$/)
    .required()
    .messages({
      'string.pattern.base': 'Invalid session ID format',
    }),
});

module.exports = {
  createPracticeSessionSchema,
  getPracticeQuerySchema,
  sessionIdSchema,
};
