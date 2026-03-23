const Joi = require('joi');

const lessonIdSchema = Joi.object({
  id: Joi.string().required(), // Allow both UUID and slug
});

const lessonIdParamSchema = Joi.object({
  lessonId: Joi.string().required(), // Allow both UUID and slug
});

const getLessonsQuerySchema = Joi.object({
  instrumentId: Joi.string().pattern(/^[0-9a-fA-F]{24}$/), // Filter by instrument (MongoDB ObjectId)
  category: Joi.string().max(100),
  difficulty: Joi.string().valid('beginner', 'intermediate', 'advanced'),
  limit: Joi.number().integer().min(1).max(100).default(50),
  offset: Joi.number().integer().min(0).default(0),
  search: Joi.string().max(100),
});

module.exports = {
  lessonIdSchema,
  lessonIdParamSchema,
  getLessonsQuerySchema,
};
