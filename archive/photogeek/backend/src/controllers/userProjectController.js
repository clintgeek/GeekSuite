const UserProject = require('../models/UserProject');
const Project = require('../models/Project');
const path = require('path');
const { extractExif } = require('../utils/exifExtractor');

/**
 * Start a project for the authenticated user
 * @route POST /api/user-projects/start/:projectId
 */
exports.startProject = async (req, res) => {
  try {
    const { projectId } = req.params;
    const userId = req.localUser?._id;

    if (!userId) {
      return res.status(401).json({ message: 'Not authorized, user not found' });
    }

    // Check if project exists
    const project = await Project.findById(projectId);
    if (!project) {
      return res.status(404).json({ message: 'Project not found' });
    }

    // Check if already started
    let userProject = await UserProject.findOne({ userId, projectId });

    if (userProject) {
      // If project is completed, allow restarting it
      if (userProject.status === 'completed') {
        // Delete the old completion and create a new session
        await UserProject.deleteOne({ userId, projectId });
        userProject = null; // Will create new one below
      } else {
        // Project is already in progress
        return res.status(400).json({ message: 'Project already in progress', userProject });
      }
    }

    // Create new user project
    userProject = new UserProject({
      userId,
      projectId,
      status: 'in-progress',
      startedAt: Date.now()
    });

    await userProject.save();

    res.status(201).json(userProject);
  } catch (error) {
    console.error('Error starting project:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

/**
 * Get all projects for the authenticated user
 * @route GET /api/user-projects
 */
exports.getUserProjects = async (req, res) => {
  try {
    const userId = req.localUser?._id;
    const { status } = req.query;

    if (!userId) {
      return res.status(401).json({ message: 'Not authorized, user not found' });
    }

    const query = { userId };
    if (status) {
      query.status = status;
    }

    const userProjects = await UserProject.find(query)
      .populate('projectId')
      .sort({ updatedAt: -1 });

    res.json(userProjects);
  } catch (error) {
    console.error('Error fetching user projects:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

/**
 * Get specific project status for user
 * @route GET /api/user-projects/:projectId
 */
exports.getUserProjectStatus = async (req, res) => {
  try {
    const { projectId } = req.params;
    const userId = req.localUser?._id;

    if (!userId) {
      return res.status(401).json({ message: 'Not authorized, user not found' });
    }

    const userProject = await UserProject.findOne({ userId, projectId });

    if (!userProject) {
      return res.json(null); // Not started yet
    }

    res.json(userProject);
  } catch (error) {
    console.error('Error fetching project status:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

/**
 * Submit a photo for a project
 * @route POST /api/user-projects/:projectId/submit
 */
exports.submitPhoto = async (req, res) => {
  try {
    const { projectId } = req.params;
    const { photoUrl } = req.body;
    const userId = req.localUser?._id;

    if (!userId) {
      return res.status(401).json({ message: 'Not authorized, user not found' });
    }

    if (!photoUrl) {
      return res.status(400).json({ message: 'Photo URL is required' });
    }

    let userProject = await UserProject.findOne({ userId, projectId });

    if (!userProject) {
      return res.status(404).json({ message: 'Project not started' });
    }

    // Extract EXIF data
    let exifData = {};
    try {
      // Convert URL to file path
      // URL: /uploads/filename.jpg -> Path: backend/uploads/filename.jpg
      const filename = photoUrl.split('/').pop();
      const filePath = path.join(__dirname, '../../uploads', filename);

      exifData = await extractExif(filePath);
    } catch (err) {
      console.warn('Failed to extract EXIF data:', err);
    }

    // Add photo to array
    userProject.photos.push({
      url: photoUrl,
      uploadDate: Date.now(),
      exifData: exifData
    });

    // Mark as completed (for MVP simplicity)
    // In future, this might require manual completion or AI verification
    if (userProject.status !== 'completed') {
      userProject.status = 'completed';
      userProject.completedAt = Date.now();

      // Award XP (fetch project to get reward amount)
      const project = await Project.findById(projectId);
      if (project) {
        userProject.xpEarned = project.xpReward;

        // Update user XP
        const User = require('../models/User');
        await User.findByIdAndUpdate(userId, {
          $inc: { xp: project.xpReward }
        });
      }
    }

    await userProject.save();

    res.json(userProject);
  } catch (error) {
    console.error('Error submitting photo:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

const { generateChatResponse } = require('../services/aiService');

/**
 * Chat with the AI Instructor for a specific project
 * @route POST /api/user-projects/:projectId/chat
 */
exports.chatWithInstructor = async (req, res) => {
  try {
    const { projectId } = req.params;
    const { message } = req.body;
    const userId = req.localUser?._id;

    if (!userId) {
      return res.status(401).json({ message: 'Not authorized, user not found' });
    }

    if (!message) {
      return res.status(400).json({ message: 'Message is required' });
    }

    // Get user project and populate project details for context
    let userProject = await UserProject.findOne({ userId, projectId }).populate('projectId');

    if (!userProject) {
      return res.status(404).json({ message: 'Project not started' });
    }

    const project = userProject.projectId;

    // Initialize chat history if empty
    if (!userProject.chatHistory || userProject.chatHistory.length === 0) {
      const systemPrompt = `You are an expert photography instructor guiding a student through a project titled "${ project.title }".

      Project Description: ${ project.description }
      Difficulty: ${ project.difficulty }
      Technique: ${ project.technique?.name } (${ project.technique?.category })

      Learning Objectives:
      ${ project.learningObjectives.map(obj => `- ${ obj }`).join('\n') }

      Tips:
      ${ project.tips.map(tip => `- ${ tip }`).join('\n') }

      Your goal is to be encouraging, helpful, and concise. Answer the student's questions about settings, composition, or the technique.
      If they are stuck, offer a specific tip from the project. Do not give away the solution entirely if it's a creative challenge, but guide them.
      Keep your responses relatively short (under 150 words) unless a detailed explanation is requested.`;

      userProject.chatHistory = [{
        role: 'system',
        content: systemPrompt,
        timestamp: new Date()
      }];
    }

    // Add user message
    userProject.chatHistory.push({
      role: 'user',
      content: message,
      timestamp: new Date()
    });

    // Prepare messages for OpenAI (map to API format)
    const apiMessages = userProject.chatHistory.map(msg => ({
      role: msg.role,
      content: msg.content
    }));

    // Get AI response
    const aiResponseContent = await generateChatResponse(apiMessages);

    // Add AI response to history
    userProject.chatHistory.push({
      role: 'assistant',
      content: aiResponseContent,
      timestamp: new Date()
    });

    await userProject.save();

    // Return the updated chat history (or just the new message)
    res.json(userProject.chatHistory);

  } catch (error) {
    console.error('Error in chat with instructor:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

/**
 * Leave a project (delete the in-progress session without recording)
 * @route DELETE /api/user-projects/:projectId/leave
 */
exports.leaveProject = async (req, res) => {
  try {
    const { projectId } = req.params;
    const userId = req.localUser?._id;

    if (!userId) {
      return res.status(401).json({ message: 'Not authorized, user not found' });
    }

    // Find the user project
    const userProject = await UserProject.findOne({ userId, projectId });

    if (!userProject) {
      return res.status(404).json({ message: 'Project not found' });
    }

    // Only allow leaving if project is in-progress (not completed)
    if (userProject.status === 'completed') {
      return res.status(400).json({ message: 'Cannot leave a completed project' });
    }

    // Delete the in-progress session
    await UserProject.deleteOne({ userId, projectId });

    res.json({ message: 'Project left successfully' });
  } catch (error) {
    console.error('Error leaving project:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

