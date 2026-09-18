import axios from 'axios';

export const BACKEND_URL = (import.meta.env.VITE_BACKEND_URL || 'https://novagk.dev').replace(/\/$/, '');
export const API_BASE_URL = import.meta.env.VITE_API_URL || (import.meta.env.PROD ? BACKEND_URL : '');

export function getShortUrl(shortCode: string): string {
  if (!shortCode) return '';
  return `${BACKEND_URL}/${shortCode}`;
}

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor: attach JWT token and client timezone if present
apiClient.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token && config.headers) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (tz && config.headers) {
      config.headers['x-timezone'] = tz;
    }
    return config;
  },
  (error) => Promise.reject(error),
);

// Response interceptor: handle 401 unauthenticated
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response && error.response.status === 401) {
      // Clear token on 401 if on protected route
      const isAuthRoute =
        window.location.pathname.includes('/login') ||
        window.location.pathname.includes('/register');
      if (!isAuthRoute) {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
      }
    }
    return Promise.reject(error);
  },
);

export default apiClient;
