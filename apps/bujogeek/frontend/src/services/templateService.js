import apiClient from './apiClient';

const templateService = {
  // Get all templates with optional filters
  getTemplates: async (filters = {}) => {
    const { type, tags, isPublic, search } = filters;
    const params = new URLSearchParams();

    if (type) params.append('type', type);
    if (tags) params.append('tags', tags.join(','));
    if (isPublic !== undefined) params.append('isPublic', isPublic);
    if (search) params.append('search', search);

    const response = await apiClient.get(`/templates?${params.toString()}`);
    return response.data;
  },

  // Get a single template
  getTemplate: async (id) => {
    const response = await apiClient.get(`/templates/${id}`);
    return response.data;
  },

  // Create a new template
  createTemplate: async (templateData) => {
    const response = await apiClient.post(`/templates`, templateData);
    return response.data;
  },

  // Update a template
  updateTemplate: async (id, templateData) => {
    const response = await apiClient.put(`/templates/${id}`, templateData);
    return response.data;
  },

  // Delete a template
  deleteTemplate: async (id) => {
    const response = await apiClient.delete(`/templates/${id}`);
    return response.data;
  },

  // Apply a template with variables
  applyTemplate: async (id, variables = {}) => {
    const response = await apiClient.post(`/templates/${id}/apply`, { variables });
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