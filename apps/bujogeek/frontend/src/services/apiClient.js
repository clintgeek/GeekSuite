import axios from 'axios';
import { setupAxiosInterceptors } from '@geeksuite/auth';

const API_URL = import.meta.env.VITE_API_URL || '/api';

const apiClient = axios.create({
    baseURL: API_URL,
    withCredentials: true,
    headers: {
        'Content-Type': 'application/json',
    },
});

// Attach the auto-refresh 401 interceptor
setupAxiosInterceptors(apiClient);

export default apiClient;
