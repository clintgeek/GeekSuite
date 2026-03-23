import axios from './api';

const API_URL = '/api/user-projects';

/**
 * Start a project
 */
const startProject = async (projectId) => {
  const response = await axios.post(`${ API_URL }/start/${ projectId }`);
  return response.data;
};

/**
 * Get all user projects
 */
const getUserProjects = async (status = '') => {
  const params = status ? `?status=${ status }` : '';
  const response = await axios.get(`${ API_URL }${ params }`);
  // Ensure we always return an array, even if API returns error object or null
  const data = response.data;
  return Array.isArray(data) ? data : [];
};

/**
 * Get status of a specific project
 */
const getProjectStatus = async (projectId) => {
  const response = await axios.get(`${ API_URL }/${ projectId }`);
  return response.data;
};

/**
 * Submit a photo for a project
 */
const submitPhoto = async (projectId, photoUrl) => {
  const response = await axios.post(`${ API_URL }/${ projectId }/submit`, { photoUrl });
  return response.data;
};

/**
 * Send a chat message to the AI Instructor
 */
const sendChatMessage = async (projectId, message) => {
  const response = await axios.post(`${ API_URL }/${ projectId }/chat`, { message });
  return response.data;
};

/**
 * Leave a project (delete in-progress session)
 */
const leaveProject = async (projectId) => {
  const response = await axios.delete(`${ API_URL }/${ projectId }/leave`);
  return response.data;
};

const userProjectService = {
  startProject,
  getUserProjects,
  getProjectStatus,
  submitPhoto,
  sendChatMessage,
  leaveProject,
};

export default userProjectService;
