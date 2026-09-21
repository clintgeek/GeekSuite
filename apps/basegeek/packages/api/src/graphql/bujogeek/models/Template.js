import mongoose from 'mongoose';
import { getAppConnection } from '../../shared/appConnections.js';

const bujoConn = getAppConnection('bujogeek');

const templateSchema = new mongoose.Schema({
  // Basic template information
  name: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String,
    trim: true
  },
  type: {
    type: String,
    enum: ['daily', 'weekly', 'monthly', 'meeting', 'custom'],
    default: 'custom'
  },
  content: {
    type: String,
    required: true
  },

  // Template configuration
  isDefault: {
    type: Boolean,
    default: false
  },
  isPublic: {
    type: Boolean,
    default: false
  },
  tags: [{
    type: String,
    trim: true
  }],

  // Template metadata
  variables: [{
    name: String,
    type: {
      type: String,
      enum: ['text', 'date', 'number', 'list'],
      default: 'text'
    },
    defaultValue: String,
    required: Boolean
  }],

  // System fields
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  lastUsed: {
    type: Date,
    default: null
  }
});

// Update the updatedAt field before saving
templateSchema.pre('save', function (next) {
  this.updatedAt = new Date();
  next();
});

// Virtual for template preview (first 100 characters)
templateSchema.virtual('preview').get(function () {
  return this.content.substring(0, 100) + (this.content.length > 100 ? '...' : '');
});

// Use mongoose.models.Template if it exists, otherwise create a new model
const Template = bujoConn.models.Template || bujoConn.model('Template', templateSchema);

// `templates` filters on `createdBy` (plus optional type/isDefault) and sorts
// by name. The MODEL declared no index; the live collection turned out to
// carry legacy ones from an older schema — `createdBy_1_type_1`,
// `isPublic_1_type_1`, `tags_1` — none of which are declared here any more.
// So the filter was already served and the practical gain from this is the
// sort, on a collection holding two rows. Declared anyway because an index
// the code does not know about is one nobody can reason about.
//
// NOTE: this builds LAZILY. `resolvers.js` imports this model with a dynamic
// `await import(...)` inside the resolver, so the model is not registered at
// boot and autoIndex does not run until the templates query is first hit —
// unlike every other model here, whose indexes appear immediately on deploy.
templateSchema.index({ createdBy: 1, name: 1 });

export default Template;