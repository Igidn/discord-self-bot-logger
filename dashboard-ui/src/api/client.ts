import axios from 'axios';

const token = localStorage.getItem('authToken') || import.meta.env.VITE_AUTH_TOKEN || '';

export const apiClient = axios.create({
  baseURL: '/api/v1',
  headers: {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  },
  timeout: 30000,
});

apiClient.interceptors.request.use(
  (config) => {
    const t = localStorage.getItem('authToken') || import.meta.env.VITE_AUTH_TOKEN || '';
    if (t) {
      config.headers.Authorization = `Bearer ${t}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (axios.isAxiosError(error)) {
      if (error.response?.status === 401) {
        console.error('Authentication failed. Please check your auth token.');
      } else if (error.response?.status === 403) {
        console.error('Access denied.');
      } else if (error.response?.status >= 500) {
        console.error('Server error. Please try again later.');
      }
    }
    return Promise.reject(error);
  }
);

export default apiClient;
