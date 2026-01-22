import React, { createContext, useState, useContext, useEffect, useRef } from 'react';
import axios from 'axios';
import { authAPI } from '@/api/localClient';

const AuthContext = createContext({
  user: null,
  isAuthenticated: false,
  isLoadingAuth: true,
  authError: null,
  login: async () => {},
  logout: () => {},
  // checkUserAuth: async () => {}
  loadUser: async () => {}
});

const API_URL = 'http://localhost:3001/api';

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);
  const [authError, setAuthError] = useState(null);

  const hasLoadedUserRef = useRef(false);

  // useEffect(() => {
    // checkUserAuth();
    // loadUser();
  // }, []);
  useEffect(() => {
    if (hasLoadedUserRef.current) return; // evita doble llamada por StrictMode
    hasLoadedUserRef.current = true;

    if (localStorage.getItem('token')) {
      loadUser();
    } else {
      setIsLoadingAuth(false);
    }
  }, []);

  // const checkUserAuth = async () => {
    // try {
      // setIsLoadingAuth(true);
      // const token = localStorage.getItem('token');

      // if (!token) {
        // setIsLoadingAuth(false);
        // setIsAuthenticated(false);
        // return;
      // }

      // const response = await axios.get(`${API_URL}/auth/me`, {
        // headers: {
          // 'Authorization': `Bearer ${token}`
        // }
      // });

      // setUser(response.data);
      // setIsAuthenticated(true);
      // setIsLoadingAuth(false);
    // } catch (error) {
      // console.error('User auth check failed:', error);
      // setIsLoadingAuth(false);
      // setIsAuthenticated(false);

      // if (error.response?.status === 401 || error.response?.status === 403) {
        // localStorage.removeItem('token');
        // setAuthError({
          // type: 'auth_required',
          // message: 'Authentication required'
        // });
      // }
    // }
  // };
  const loadUser = async () => {
    try {
      setIsLoadingAuth(true);
      const userData = await authAPI.me();  // usa localClient con token
      setUser(userData);  // userData ya es response.data.user
      setIsAuthenticated(true);
    } catch (error) {
      console.error('Error loading user:', error);
      setUser(null);
      setIsAuthenticated(false);
      if (error.response?.status === 401 || error.response?.status === 403) {
        localStorage.removeItem('token');
        setAuthError({
          type: 'auth_required',
          message: 'Authentication required'
        });
      }
    } finally {
      setIsLoadingAuth(false);
    }
  };

  const login = async (email, password) => {
    try {
      // const response = await axios.post(`${API_URL}/auth/login`, {
        // email,
        // password
      // });

      // const { token, user: userData } = response.data;
      const { token, user } = await authAPI.login(email, password);
      localStorage.setItem('token', token);

      // Opcional: setear inmediatamente el user del login
      setUser(user);
      setIsAuthenticated(true);
      setAuthError(null);

      // await checkUserAuth();
      // Y si quieres, refrescar desde /me por si trae más campos:
      await loadUser();

      return { success: true };
    } catch (error) {
      console.error('Login error:', error);
      return {
        success: false,
        error: error.response?.data?.error || 'Error al iniciar sesión'
      };
    }
  };

  const logout = async (shouldRedirect = true) => {
    await authAPI.logout(); // limpia token en backend + local
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
    // checkUserAuth
    loadUser
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
