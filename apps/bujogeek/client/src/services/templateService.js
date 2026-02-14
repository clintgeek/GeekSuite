import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5001/api';

const templateService = {
  // Get all templates with optional filters
  getTemplates: async (filters = {}) => {
    const { type, tags, isPublic, search } = filters;
    const params = new URLSearchParams();

    if (type) params.append('type', type);
    if (tags) params.append('tags', tags.join(','));
    if (isPublic !== undefined) params.append('isPublic', isPublic);
    if (search) params.append('search', search);

    const response = await axios.get(`${API_URL}/templates?${params.toString()}`);
    return response.data;
  },

  // Get a single template
  getTemplate: async (id) => {
    const response = await axios.get(`${API_URL}/templates/${id}`);
    return response.data;
  },

  // Create a new template
  createTemplate: async (templateData) => {
    const response = await axios.post(`${API_URL}/templates`, templateData);
    return response.data;
  },

  // Update a template
  updateTemplate: async (id, templateData) => {
    const response = await axios.put(`${API_URL}/templates/${id}`, templateData);
    return response.data;
  },

  // Delete a template
  deleteTemplate: async (id) => {
    const response = await axios.delete(`${API_URL}/templates/${id}`);
    return response.data;
  },

  // Apply a template with variables
  applyTemplate: async (id, variables = {}) => {
    const response = await axios.post(`${API_URL}/templates/${id}/apply`, { variables });
    return response.data;
  },

  // Get template types
  getTemplateTypes: () => {
    return {
      daily: 'Daily Log',
      weekly: 'Weekly Review',
      monthly: 'Monthly Review',
      meeting: 'Meeting Notes',
      custom: 'Custom'
    };
  }
};

export default templateService;