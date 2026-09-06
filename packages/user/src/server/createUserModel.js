'use strict';

const mongoose = require('mongoose');

/**
 * Base fields shared by every GeekSuite app's local user record.
 * Apps extend these with their own domain-specific fields.
 */
const BASE_FIELDS = {
  userId: {
    type: String,
    unique: true,
    sparse: true,
    index: true,
  },
  email: {
    type: String,
    unique: true,
    sparse: true,
    lowercase: true,
    trim: true,
  },
  displayName: { type: String, default: '' },
  avatarUrl: { type: String, default: '' },
};

/**
 * Create a Mongoose model for an app's local user record.
 *
 * @param {string} modelName – Mongoose model name (e.g. 'UserProfile', 'User')
 * @param {object} extensionFields – app-specific schema fields to merge with the base
 * @param {object} [options]
 * @param {string} [options.collection] – explicit Mongo collection name
 * @param {object} [options.schemaOptions] – additional Mongoose schema options
 * @param {function} [options.configureSchema] – (schema) => void – hook to add methods, virtuals, indexes, etc.
 * @returns {mongoose.Model}
 */
function createUserModel(modelName, extensionFields = {}, options = {}) {
  const { collection, schemaOptions = {}, configureSchema } = options;

  const schemaDefinition = {
    ...BASE_FIELDS,
    ...extensionFields,
  };

  const schema = new mongoose.Schema(schemaDefinition, {
    timestamps: true,
    ...(collection ? { collection } : {}),
    ...schemaOptions,
  });

  // No `schema.index({ userId: 1 })` / `schema.index({ email: 1 })` here.
  // Both paths already declare `unique: true, sparse: true` above, which is
  // itself an index declaration, and a second bare `schema.index()` on the
  // same key produces a *second* spec with the same default name (`userId_1`)
  // and different options. Mongoose warns ("Duplicate schema index"), and
  // MongoDB refuses the second `createIndex` with `IndexOptionsConflict` —
  // an error mongoose raises on the model's `index` event, which nothing
  // listens for, so it lands as a silent boot-time failure.

  if (configureSchema) {
    configureSchema(schema);
  }

  return mongoose.model(modelName, schema);
}

module.exports = { createUserModel };
