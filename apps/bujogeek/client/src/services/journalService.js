import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5001/api';

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

    const response = await axios.get(`${API_URL}/journal?${params.toString()}`);
    return response.data;
  },

  // Get a single journal entry
  getEntry: async (id) => {
    const response = await axios.get(`${API_URL}/journal/${id}`);
    return response.data;
  },

  // Create a new journal entry
  createEntry: async (entryData) => {
    const response = await axios.post(`${API_URL}/journal`, entryData);
    return response.data;
  },

  // Update a journal entry
  updateEntry: async (id, entryData) => {
    const response = await axios.put(`${API_URL}/journal/${id}`, entryData);
    return response.data;
  },

  // Delete a journal entry
  deleteEntry: async (id) => {
    const response = await axios.delete(`${API_URL}/journal/${id}`);
    return response.data;
  },

  // Create entry from template
  createFromTemplate: async (templateData) => {
    const response = await axios.post(`${API_URL}/journal/from-template`, templateData);
    return response.data;
  }
};

export default journalService;