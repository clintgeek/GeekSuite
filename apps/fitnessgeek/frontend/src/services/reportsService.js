import { fitnessGeekService } from './fitnessGeekService.js';

const buildQuery = (params = {}) => {
  const query = new URLSearchParams();
  if (params.start) query.append('start', params.start);
  if (params.days) query.append('days', params.days);
  return query.toString() ? `?${query.toString()}` : '';
};

export const reportsService = {
  async getOverview(options = {}) {
    const response = await fitnessGeekService.get(`/food-reports/overview${buildQuery(options)}`);
    return response?.data ?? response;
  },

  async getTrends(options = {}) {
    const response = await fitnessGeekService.get(`/food-reports/trends${buildQuery(options)}`);
    return response?.data ?? response;
  },

  async export(options = {}) {
    const query = new URLSearchParams({ format: 'csv' });
    if (options.start) query.append('start', options.start);
    if (options.days) query.append('days', options.days);
    const url = `/food-reports/export?${query.toString()}`;
    return fitnessGeekService.get(url, { responseType: 'blob' });
  }
};

export default reportsService;
