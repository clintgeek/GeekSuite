import mongoose from 'mongoose';

const journalEntrySchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    trim: true
  },
  content: {
    type: String,
    required: true
  },
  type: {
    type: String,
    enum: ['daily', 'weekly', 'monthly', 'meeting', 'custom'],
    default: 'daily'
  },
  date: {
    type: Date,
    required: true,
    default: Date.now
  },
  tags: [{
    type: String,
    trim: true
  }],
  templateId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Template',
    required: false
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  metadata: {
    mood: String,
    energy: String,
    location: String,
    weather: String,
    customFields: Map
  },
  status: {
    type: String,
    enum: ['draft', 'published'],
    default: 'published'
  }
}, {
  timestamps: true
});

// Add text index for search
journalEntrySchema.index({
  title: 'text',
  content: 'text',
  tags: 'text'
});

// Virtual for entry preview
journalEntrySchema.virtual('preview').get(function() {
  return this.content.substring(0, 200) + (this.content.length > 200 ? '...' : '');
});

// Use mongoose.models.JournalEntry if it exists, otherwise create a new model
const JournalEntry = mongoose.models.JournalEntry || mongoose.model('JournalEntry', journalEntrySchema);

export default JournalEntry;