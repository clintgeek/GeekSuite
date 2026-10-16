import { apiService } from './apiService.js';
import { restClient as restApi } from './restClient.js';

/**
 * Medications Service
 *
 * Two kinds of endpoints:
 *  - CRUD on the user's medication list → backed by GraphQL (via apiService)
 *  - RxNorm lookup / dose logs → live only as REST on the fitnessgeek backend
 *
 * CRUD operations go through apiService (mapped to fitnessMedications,
 * addFitnessMedication, updateFitnessMedication, deleteFitnessMedication).
 *
 * RxNorm search, detail lookup, and dose-logging go direct to REST.
 */

const unwrap = (response) => response?.data?.data ?? response?.data ?? response;

export const medsService = {
  // ─── REST (no GraphQL equivalent) ───
  async search(q) {
    const response = await restApi.get(`/meds/search`, { params: { q } });
    return unwrap(response);
  },

  async getDetails(rxcui) {
    const response = await restApi.get(`/meds/rxcui/${encodeURIComponent(rxcui)}`);
    return unwrap(response);
  },

  async log(id, body) {
    const response = await restApi.post(`/meds/${id}/logs`, body);
    return unwrap(response);
  },

  async getLogsByDate(date) {
    const response = await restApi.get(`/meds/logs/by-date`, { params: { date } });
    return unwrap(response);
  },

  // ─── GraphQL (via apiService mapping) ───
  async list() {
    const response = await apiService.get('/meds');
    return response.data || response;
  },

  async getById(id) {
    // Fall back to filtering the list — there's a single-med query but no mapping yet.
    // This is rarely called; keeping it simple.
    const list = await this.list();
    return Array.isArray(list) ? list.find((m) => m._id === id || m.id === id) : null;
  },

  async save(payload) {
    const response = await apiService.post('/meds', payload);
    return response.data || response;
  },

  async update(id, payload) {
    const response = await apiService.put(`/meds/${id}`, payload);
    return response.data || response;
  },

  // `deleteFitnessMedication` answers a Boolean. `response.data || response`
  // turned a `false` into the (truthy) envelope, so a delete that didn't
  // happen read as done. Resolves to the Boolean; throws on `false`.
  async remove(id) {
    const response = await apiService.delete(`/meds/${id}`);
    const ok = response?.data;
    if (ok === false) throw new Error('Medication was not removed');
    return ok !== false;
  },
};

export default medsService;
