import Folder from '../models/Folder.js';
import Note from '../models/Note.js'; // Needed for delete logic

// Basic check for valid ObjectId format (reuse or redefine if needed)
const isValidObjectId = (id) => {
  return id && /^[0-9a-fA-F]{24}$/.test(id);
};

// @desc    Create a new folder
// @route   POST /api/folders
// @access  Private
export const createFolder = async (req, res) => {
  const { name } = req.body;
  const userId = req.user._id;

  if (!name || name.trim().length === 0) {
    return res.status(400).json({ message: 'Folder name cannot be empty' });
  }

  try {
    // Check for existing folder with the same name for this user (using the unique index)
    const existingFolder = await Folder.findOne({ userId, name: name.trim() });
    if (existingFolder) {
        return res.status(400).json({ message: `Folder with name '${name.trim()}' already exists` });
    }

    const folder = await Folder.create({
      name: name.trim(),
      userId,
    });
    res.status(201).json(folder);
  } catch (error) {
    console.error('Error creating folder:', error);
    // Handle potential unique constraint violation (though findOne check should prevent it)
    if (error.code === 11000) {
        return res.status(400).json({ message: `Folder with name '${name.trim()}' already exists` });
    }
     if (error.name === 'ValidationError') {
        return res.status(400).json({ message: 'Validation Error', errors: error.errors });
    }
    res.status(500).json({ message: 'Server error creating folder' });
  }
};

// @desc    Get all folders for the logged-in user
// @route   GET /api/folders
// @access  Private
export const getFolders = async (req, res) => {
  const userId = req.user._id;

  try {
    const folders = await Folder.find({ userId: userId }).sort({ name: 1 }); // Sort alphabetically
    res.status(200).json(folders);
  } catch (error) {
    console.error('Error fetching folders:', error);
    res.status(500).json({ message: 'Server error fetching folders' });
  }
};

// @desc    Update a folder
// @route   PUT /api/folders/:id
// @access  Private
export const updateFolder = async (req, res) => {
  const userId = req.user._id;
  const folderId = req.params.id;
  const { name } = req.body;

  // Validate ID
  if (!isValidObjectId(folderId)) {
    return res.status(400).json({ message: 'Invalid Folder ID format' });
  }

  // Validate name
  if (!name || name.trim().length === 0) {
    return res.status(400).json({ message: 'Folder name cannot be empty' });
  }

  try {
    // Check if a folder with the new name already exists for the user
    const existingFolder = await Folder.findOne({ userId, name: name.trim(), _id: { $ne: folderId } });
    if (existingFolder) {
        return res.status(400).json({ message: `Another folder with name '${name.trim()}' already exists` });
    }

    // Find the folder and ensure it belongs to the user, then update
    const folder = await Folder.findOneAndUpdate(
        { _id: folderId, userId: userId },
        { name: name.trim() },
        { new: true, runValidators: true } // Return updated doc, run schema validators
    );

    if (!folder) {
      return res.status(404).json({ message: 'Folder not found or does not belong to user' });
    }

    res.status(200).json(folder);

  } catch (error) {
    console.error('Error updating folder:', error);
     // Handle potential unique constraint violation (though findOne check should prevent it)
    if (error.code === 11000) {
        return res.status(400).json({ message: `Another folder with name '${name.trim()}' already exists` });
    }
    if (error.name === 'ValidationError') {
        return res.status(400).json({ message: 'Validation Error', errors: error.errors });
    }
    res.status(500).json({ message: 'Server error updating folder' });
  }
};

// @desc    Delete a folder
// @route   DELETE /api/folders/:id
// @access  Private
export const deleteFolder = async (req, res) => {
  const userId = req.user._id;
  const folderId = req.params.id;
  const { deleteNotes } = req.query; // Check query param for note deletion preference

  // Validate ID
  if (!isValidObjectId(folderId)) {
    return res.status(400).json({ message: 'Invalid Folder ID format' });
  }

  try {
    // Find the folder and ensure it belongs to the user
    const folder = await Folder.findOne({ _id: folderId, userId: userId });

    if (!folder) {
      return res.status(404).json({ message: 'Folder not found or does not belong to user' });
    }

    // Handle associated notes based on query parameter
    if (deleteNotes === 'true') {
        // Cascade delete: Delete all notes within this folder
        const deleteResult = await Note.deleteMany({ folderId: folderId, userId: userId });
        console.log(`Deleted ${deleteResult.deletedCount} notes associated with folder ${folderId}`);
    } else {
        // Unassign folderId: Set folderId to null for notes in this folder
        const updateResult = await Note.updateMany({ folderId: folderId, userId: userId }, { $set: { folderId: null } });
        console.log(`Unassigned ${updateResult.modifiedCount} notes from folder ${folderId}`);
    }

    // Delete the folder itself
    await Folder.deleteOne({ _id: folderId, userId: userId });

    res.status(200).json({ message: 'Folder deleted successfully' });

  } catch (error) {
    console.error('Error deleting folder:', error);
    res.status(500).json({ message: 'Server error deleting folder' });
  }
};