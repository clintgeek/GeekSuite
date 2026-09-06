import { fitnessGeekService } from './fitnessGeekService.js';
import { restClient as restApi } from './restClient.js';

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

  // CSV export is REST-only: it returns a text/csv body, and the GraphQL
  // router has no mapping for /food-reports/export — sending it through
  // fitnessGeekService.get threw "Rest proxy gap" on every click, which the
  // Reports page reported as "Failed to export report".
  async export(options = {}) {
    const query = new URLSearchParams({ format: 'csv' });
    if (options.start) query.append('start', options.start);
    if (options.days) query.append('days', options.days);
    const response = await restApi.get(
      `/food-reports/export?${query.toString()}`,
      { responseType: 'blob' }
    );
    return response.data;
  }
};

export default reportsService;
