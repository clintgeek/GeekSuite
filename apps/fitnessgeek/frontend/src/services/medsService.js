import { apiService } from './apiService.js';

export const medsService = {
  search: (q) => apiService.get(`/meds/search?q=${encodeURIComponent(q)}`),
  getDetails: (rxcui) => apiService.get(`/meds/rxcui/${encodeURIComponent(rxcui)}`),
  getById: (id) => apiService.get(`/meds/${id}`),
  list: () => apiService.get('/meds'),
  save: (payload) => apiService.post('/meds', payload),
  update: (id, payload) => apiService.put(`/meds/${id}`, payload),
  log: (id, body) => apiService.post(`/meds/${id}/logs`, body),
  getLogsByDate: (date) => apiService.get(`/meds/logs/by-date?date=${encodeURIComponent(date)}`),
  remove: (id) => apiService.delete(`/meds/${id}`),
};

export default medsService;


