import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

const localClient = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Interceptor para agregar token a todas las peticiones
localClient.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('auth_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Interceptor para manejar errores de autenticación
localClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Token expirado o inválido
      localStorage.removeItem('auth_token');
      localStorage.removeItem('user_data');
      window.location.href = '/';
    }
    return Promise.reject(error);
  }
);

// API de autenticación
export const authAPI = {
  login: async (email, password) => {
    const response = await localClient.post('/api/auth/login', { email, password });
    return response.data;
  },

  me: async () => {
    const response = await localClient.get('/api/auth/me');
    return response.data.user;
  },

  logout: async () => {
    try {
      await localClient.post('/api/auth/logout');
    } catch (error) {
      console.error('Error en logout:', error);
    } finally {
      localStorage.removeItem('auth_token');
      localStorage.removeItem('user_data');
    }
  },

  register: async (email, password, full_name) => {
    const response = await localClient.post('/api/auth/register', {
      email,
      password,
      full_name
    });
    return response.data;
  },

  isAuthenticated: () => {
    const token = localStorage.getItem('auth_token');
    return !!token;
  }
};

export default localClient;
