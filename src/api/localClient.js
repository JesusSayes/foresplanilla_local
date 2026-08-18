import axios from 'axios';
import { API_BASE_URL } from './apiConfig';

const localClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Interceptor para agregar token a todas las peticiones
localClient.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
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
      localStorage.removeItem('token');
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
      localStorage.removeItem('token');
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

  changePassword: async (email, newPassword) => {
    const response = await localClient.put('/api/auth/change-password', { email, newPassword });
    return response.data;
  },

  isAuthenticated: () => {
    const token = localStorage.getItem('token');
    return !!token;
  }
};

export const mailerAPI = {
  inviteUser: async ({ email, name }) => {
    const response = await localClient.post('/api/mailer/invite-user', { email, name });
    return response.data;
  },
  sendContractRenewalAlert: async (data) => {
    const response = await localClient.post('/api/mailer/contract-renewal-alert', data);
    return response.data;
  },
};

export const contractNotificationsAPI = {
  recipients: async () => {
    const response = await localClient.get('/api/contract-notifications/recipients');
    return response.data;
  },
  run: async () => {
    const response = await localClient.post('/api/contract-notifications/run');
    return response.data;
  },
};

export const starsoftAPI = {
  testConnection: async () => {
    const response = await localClient.post('/api/starsoft/migrate', { mode: 'test' });
    return response.data;
  },
  migrate: async (data) => {
    const response = await localClient.post('/api/starsoft/migrate', data);
    return response.data;
  },
};

export default localClient;
