import JournalEntry from '../models/JournalEntry.js';
import Template from '../models/Template.js';
import { handleError } from '../utils/errorHandler.js';

// Create a new journal entry
export const createEntry = async (req, res) => {
  try {
    const { title, content, type, date, tags, templateId, metadata } = req.body;

    if (!req.user?._id) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const userId = req.user._id;

    const entry = new JournalEntry({
      title,
      content,
      type,
      date: date || new Date(),
      tags,
      templateId,
      metadata,
      createdBy: userId
    });

    await entry.save();
    res.status(201).json(entry);
  } catch (error) {
    handleError(res, error);
  }
};

// Get all journal entries with filtering
export const getEntries = async (req, res) => {
  try {
    const { type, startDate, endDate, search, tags } = req.query;
    const query = {};

    if (!req.user?._id) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const userId = req.user._id;
    query.createdBy = userId;

    if (type) {
      query.type = type;
    }

    if (startDate || endDate) {
      query.date = {};
      if (startDate) query.date.$gte = new Date(startDate);
      if (endDate) query.date.$lte = new Date(endDate);
    }

    if (tags) {
      query.tags = { $in: tags.split(',') };
    }

    if (search) {
      query.$text = { $search: search };
    }

    const entries = await JournalEntry.find(query)
      .sort({ date: -1, createdAt: -1 })
      .populate('templateId', 'name type');

    res.json(entries);
  } catch (error) {
    handleError(res, error);
  }
};

// Get a single journal entry
export const getEntry = async (req, res) => {
  try {
    if (!req.user?._id) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const userId = req.user._id;
    const entry = await JournalEntry.findOne({
      _id: req.params.id,
      createdBy: userId
    }).populate('templateId', 'name type');

    if (!entry) {
      return res.status(404).json({ message: 'Entry not found' });
    }

    res.json(entry);
  } catch (error) {
    handleError(res, error);
  }
};

// Update a journal entry
export const updateEntry = async (req, res) => {
  try {
    const { title, content, type, date, tags, metadata } = req.body;

    if (!req.user?._id) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const userId = req.user._id;

    const entry = await JournalEntry.findOneAndUpdate(
      { _id: req.params.id, createdBy: userId },
      { title, content, type, date, tags, metadata },
      { new: true, runValidators: true }
    );

    if (!entry) {
      return res.status(404).json({ message: 'Entry not found' });
    }

    res.json(entry);
  } catch (error) {
    handleError(res, error);
  }
};

// Delete a journal entry
export const deleteEntry = async (req, res) => {
  try {
    if (!req.user?._id) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const userId = req.user._id;
    const entry = await JournalEntry.findOneAndDelete({
      _id: req.params.id,
      createdBy: userId
    });

    if (!entry) {
      return res.status(404).json({ message: 'Entry not found' });
    }

    res.json({ message: 'Entry deleted successfully' });
  } catch (error) {
    handleError(res, error);
  }
};

// Create entry from template
export const createFromTemplate = async (req, res) => {
  try {
    const { templateId, variables, title, date, tags, metadata } = req.body;

    if (!req.user?._id) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const userId = req.user._id;

    // Find the template
    const template = await Template.findById(templateId);
    if (!template) {
      return res.status(404).json({ message: 'Template not found' });
    }

    // Process template content with variables
    let processedContent = template.content;
    Object.entries(variables || {}).forEach(([key, value]) => {
      const regex = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
      processedContent = processedContent.replace(regex, value || `{{${key}}}`);
    });

    // Create the journal entry
    const entry = new JournalEntry({
      title: title || template.name,
      content: processedContent,
      type: template.type,
      date: date || new Date(),
      tags: tags || template.tags,
      templateId: template._id,
      metadata,
      createdBy: userId
    });

    await entry.save();

    // Update template's last used timestamp
    template.lastUsed = new Date();
    await template.save();

    res.status(201).json(entry);
  } catch (error) {
    handleError(res, error);
  }
};