import axios from './api';

const API_URL = '/api/projects';

/**
 * Get all projects
 */
const getProjects = async (filters = {}) => {
  const params = new URLSearchParams();

  if (filters.difficulty) params.append('difficulty', filters.difficulty);
  if (filters.technique) params.append('technique', filters.technique);
  if (filters.subject) params.append('subject', filters.subject);

  const queryString = params.toString();
  const url = queryString ? `${ API_URL }?${ queryString }` : API_URL;

  const response = await axios.get(url);
  // Ensure we always return an array
  const data = response.data;
  return Array.isArray(data) ? data : [];
};

/**
 * Get project by ID
 */
const getProjectById = async (id) => {
  const response = await axios.get(`${ API_URL }/${ id }`);
  return response.data;
};

/**
 * Get project by slug
 */
const getProjectBySlug = async (slug) => {
  const response = await axios.get(`${ API_URL }/slug/${ slug }`);
  return response.data;
};

const projectService = {
  getProjects,
  getProjectById,
  getProjectBySlug,
};

export default projectService;
