import axios from 'axios';
import useSharedAuthStore from './store/sharedAuthStore';

const api = axios.create({ baseURL: '/api' });

api.interceptors.request.use((config) => {
  const { token } = useSharedAuthStore.getState();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export default api;