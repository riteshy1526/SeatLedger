import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api',
  timeout: 10000,
});

// Request interceptor to attach JWT token
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('seatledger_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor to handle unauthenticated 401
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response && error.response.status === 401) {
      // Token expired or invalid
      if (window.location.pathname !== '/login') {
        localStorage.removeItem('seatledger_token');
        localStorage.removeItem('seatledger_user');
        localStorage.removeItem('seatledger_library');
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);

export default api;
