import React, { createContext, useState, useContext, useEffect } from 'react';
import axios from 'axios';

const AuthContext = createContext({
  user: null,
  isAuthenticated: false,
  isLoadingAuth: true,
  authError: null,
  login: async () => {},
  logout: () => {},
  checkUserAuth: async () => {}
});

const API_URL = 'http://localhost:3001/api';

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);
  const [authError, setAuthError] = useState(null);

  useEffect(() => {
    checkUserAuth();
  }, []);

  const checkUserAuth = async () => {
    try {
      setIsLoadingAuth(true);
      const token = localStorage.getItem('token');

      if (!token) {
        setIsLoadingAuth(false);
        setIsAuthenticated(false);
        return;
      }

      const response = await axios.get(`${API_URL}/auth/me`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      setUser(response.data);
      setIsAuthenticated(true);
      setIsLoadingAuth(false);
    } catch (error) {
      console.error('User auth check failed:', error);
      setIsLoadingAuth(false);
      setIsAuthenticated(false);

      if (error.response?.status === 401 || error.response?.status === 403) {
        localStorage.removeItem('token');
        setAuthError({
          type: 'auth_required',
          message: 'Authentication required'
        });
      }
    }
  };

  const login = async (email, password) => {
    try {
      const response = await axios.post(`${API_URL}/auth/login`, {
        email,
        password
      });

      const { token, user: userData } = response.data;
      localStorage.setItem('token', token);

      await checkUserAuth();

      return { success: true };
    } catch (error) {
      console.error('Login error:', error);
      return {
        success: false,
        error: error.response?.data?.error || 'Error al iniciar sesión'
      };
    }
  };

  const logout = (shouldRedirect = true) => {
    setUser(null);
    setIsAuthenticated(false);
    localStorage.removeItem('token');

    if (shouldRedirect) {
      window.location.href = '/';
    }
  };

  const value = {
    user,
    isAuthenticated,
    isLoadingAuth,
    authError,
    login,
    logout,
    checkUserAuth
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
