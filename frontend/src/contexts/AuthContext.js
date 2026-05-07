import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import axios from 'axios';

const AuthContext = createContext(null);

const API = process.env.REACT_APP_BACKEND_URL || "http://localhost:8000";

// Set axios defaults
axios.defaults.withCredentials = true;
axios.interceptors.request.use((config) => {
  const token = localStorage.getItem('auth_token');
  if (token) {
    config.headers = config.headers || {};
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

function setAuthHeader(token) {
  if (token) {
    axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
    localStorage.setItem('auth_token', token);
  } else {
    delete axios.defaults.headers.common['Authorization'];
    localStorage.removeItem('auth_token');
  }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const checkAuth = useCallback(async () => {
    const savedToken = localStorage.getItem('auth_token');
    if (savedToken) {
      setAuthHeader(savedToken);
    }
    try {
      const { data } = await axios.get(`${API}/api/auth/me`);
      setUser(data);
    } catch {
      setAuthHeader(null);
      setUser(false);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  const login = async (email, password) => {
    const { data } = await axios.post(`${API}/api/auth/login`, { email, password });
    if (data.access_token) {
      setAuthHeader(data.access_token);
    }
    setUser({ id: data.id, email: data.email, name: data.name, role: data.role });
    return data;
  };

  const logout = async () => {
    try {
      await axios.post(`${API}/api/auth/logout`, {});
    } catch {}
    setAuthHeader(null);
    setUser(false);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, checkAuth }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
