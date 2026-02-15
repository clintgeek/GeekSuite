import mongoose from 'mongoose';

const NoteSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      trim: true,
    },
    content: {
      type: String,
      required: [true, 'Note content cannot be empty'],
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    type: {
      type: String,
      enum: ['text', 'markdown', 'code', 'mindmap', 'handwritten'],
      default: 'text',
    },
    tags: {
      type: [String],
      index: true,
      default: [],
      validate: {
        validator: function(tags) {
          // Check for valid tag format and no duplicates
          const tagSet = new Set(tags);
          return tags.length === tagSet.size && // No duplicates
                 tags.every(tag =>
                   tag.length > 0 && // Not empty
                   tag.length <= 100 && // Not too long
                   /^[a-zA-Z0-9/_-]+$/.test(tag) // Only alphanumeric, underscore, hyphen, and forward slash
                 );
        },
        message: 'Tags must be unique, non-empty, and contain only letters, numbers, underscores, hyphens, and forward slashes'
      }
    },
    isLocked: {
      type: Boolean,
      default: false,
    },
    isEncrypted: {
      // Note: Actual encryption happens in controller/service layer
      type: Boolean,
      default: false,
    },
    lockHash: {
      // Stores bcrypt hash of note-specific password if isLocked is true
      type: String,
      select: false, // Never return lockHash in queries by default
    },
  },
  {
    timestamps: true, // Automatically adds createdAt and updatedAt fields
  }
);

// Add indexes for timestamps for sorting/querying
NoteSchema.index({ createdAt: 1 });
NoteSchema.index({ updatedAt: 1 });

// Add text index for search (as per plan section 2.9)
NoteSchema.index({ title: 'text', content: 'text', tags: 'text' });

// Virtual for hierarchical tags
NoteSchema.virtual('tagHierarchy').get(function() {
  const hierarchy = {};
  this.tags.forEach(tag => {
    const parts = tag.split('/');
    let current = hierarchy;
    parts.forEach((part, index) => {
      if (!current[part]) {
        current[part] = index === parts.length - 1 ? null : {};
      }
      current = current[part];
    });
  });
  return hierarchy;
});

const Note = mongoose.model('Note', NoteSchema);

export default Note;