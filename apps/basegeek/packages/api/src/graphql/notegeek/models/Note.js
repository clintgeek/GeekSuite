import mongoose from 'mongoose';
import { getAppConnection } from '../../shared/appConnections.js';

const noteConn = getAppConnection('notegeek');

// Guard against duplicate model registration when modules hot-reload
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
    },
    isLocked: {
      type: Boolean,
      default: false,
    },
    isEncrypted: {
      type: Boolean,
      default: false,
    },
    lockHash: {
      type: String,
      select: false,
    },
  },
  {
    timestamps: true,
  }
);

NoteSchema.index({ createdAt: 1 });
NoteSchema.index({ updatedAt: 1 });
NoteSchema.index({ title: 'text', content: 'text', tags: 'text' });

const Note = noteConn.models.Note || noteConn.model('Note', NoteSchema);

export default Note;
