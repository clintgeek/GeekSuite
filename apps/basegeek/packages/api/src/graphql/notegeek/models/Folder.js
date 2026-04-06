import mongoose from 'mongoose';

const folderSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    parentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Folder',
      default: null, // null means root folder
    },
    icon: {
      type: String,
      default: 'folder', // Default Lucide/MUI icon key
    },
    color: {
      type: String,
      default: '#7C8194', // A default neutral color
    },
  },
  {
    timestamps: true,
  }
);

// Compound index to ensure folder names are unique per user per level
folderSchema.index({ userId: 1, name: 1, parentId: 1 }, { unique: true });

const Folder = mongoose.model('Folder', folderSchema);

export default Folder;
