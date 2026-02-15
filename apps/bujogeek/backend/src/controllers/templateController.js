import Template from '../models/templateModel.js';
import { handleError } from '../utils/errorHandler.js';

// Create a new template
export const createTemplate = async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const { name, description, content, type, tags, isPublic } = req.body;
    const template = new Template({
      name,
      description,
      content,
      type,
      tags,
      isPublic,
      createdBy: req.user._id
    });

    await template.save();
    res.status(201).json(template);
  } catch (error) {
    handleError(res, error);
  }
};

// Get all templates with filtering
export const getTemplates = async (req, res) => {
  try {
    const { type, tags, isPublic, search } = req.query;
    const query = {};

    // Add type filter if provided
    if (type) {
      query.type = type;
    }

    // Add tags filter if provided
    if (tags && tags.length > 0 && tags !== ',') {
      query.tags = { $in: tags.split(',') };
    }

    // Add public/private filter if provided
    if (isPublic !== undefined) {
      query.isPublic = isPublic === 'true';
    }

    // Add search filter if provided
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
        { content: { $regex: search, $options: 'i' } }
      ];
    }

    // Temporarily return all templates without authentication checks
    const templates = await Template.find(query)
      .sort({ updatedAt: -1 });

    res.json(templates);
  } catch (error) {
    handleError(res, error);
  }
};

// Get a single template
export const getTemplate = async (req, res) => {
  try {
    const query = {
      _id: req.params.id,
    };

    // When no user is authenticated, only allow access to public templates
    if (!req.user) {
      query.isPublic = true;
    } else {
      query.$or = [
        { createdBy: req.user._id },
        { isPublic: true }
      ];
    }

    const template = await Template.findOne(query);

    if (!template) {
      return res.status(404).json({ message: 'Template not found' });
    }

    res.json(template);
  } catch (error) {
    handleError(res, error);
  }
};

// Update a template
export const updateTemplate = async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const { name, description, content, type, tags, isPublic } = req.body;
    const template = await Template.findOneAndUpdate(
      { _id: req.params.id, createdBy: req.user._id },
      { name, description, content, type, tags, isPublic },
      { new: true, runValidators: true }
    );

    if (!template) {
      return res.status(404).json({ message: 'Template not found' });
    }

    res.json(template);
  } catch (error) {
    handleError(res, error);
  }
};

// Delete a template
export const deleteTemplate = async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const template = await Template.findOneAndDelete({
      _id: req.params.id,
      createdBy: req.user._id
    });

    if (!template) {
      return res.status(404).json({ message: 'Template not found' });
    }

    res.json({ message: 'Template deleted successfully' });
  } catch (error) {
    handleError(res, error);
  }
};

// Apply a template
export const applyTemplate = async (req, res) => {
  try {
    const query = {
      _id: req.params.id,
    };

    // When no user is authenticated, only allow access to public templates
    if (!req.user) {
      query.isPublic = true;
    } else {
      query.$or = [
        { createdBy: req.user._id },
        { isPublic: true }
      ];
    }

    const template = await Template.findOne(query);

    if (!template) {
      return res.status(404).json({ message: 'Template not found' });
    }

    // Update last used timestamp
    template.lastUsed = new Date();
    await template.save();

    // Replace variables in the content
    let processedContent = template.content;
    const { variables = {} } = req.body;

    Object.entries(variables).forEach(([key, value]) => {
      const regex = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
      processedContent = processedContent.replace(regex, value || `{{${key}}}`);
    });

    res.json({
      content: processedContent,
      type: template.type,
      variables: Object.keys(variables)
    });
  } catch (error) {
    handleError(res, error);
  }
};