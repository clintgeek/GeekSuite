import apiClient from './apiClient';



const journalService = {
  // Get all journal entries with optional filters
  getEntries: async (filters = {}) => {
    const { type, startDate, endDate, search, tags } = filters;
    const params = new URLSearchParams();

    if (type) params.append('type', type);
    if (startDate) params.append('startDate', startDate);
    if (endDate) params.append('endDate', endDate);
    if (search) params.append('search', search);
    if (tags?.length) params.append('tags', tags.join(','));

    const response = await apiClient.get(`/journal?${params.toString()}`);
    return response.data;
  },

  // Get a single journal entry
  getEntry: async (id) => {
    const response = await apiClient.get(`/journal/${id}`);
    return response.data;
  },

  // Create a new journal entry
  createEntry: async (entryData) => {
    const response = await apiClient.post(`/journal`, entryData);
    return response.data;
  },

  // Update a journal entry
  updateEntry: async (id, entryData) => {
    const response = await apiClient.put(`/journal/${id}`, entryData);
    return response.data;
  },

  // Delete a journal entry
  deleteEntry: async (id) => {
    const response = await apiClient.delete(`/journal/${id}`);
    return response.data;
  },

  // Create entry from template
  createFromTemplate: async (templateData) => {
    const response = await apiClient.post(`/journal/from-template`, templateData);
    return response.data;
  }
};

export default journalService;