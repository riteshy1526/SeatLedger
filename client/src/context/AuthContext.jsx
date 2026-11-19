import React, { createContext, useContext, useState, useEffect } from 'react';
import api from '../services/api';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(() => {
    const saved = localStorage.getItem('seatledger_user');
    return saved ? JSON.parse(saved) : null;
  });

  const [library, setLibrary] = useState(() => {
    const saved = localStorage.getItem('seatledger_library');
    return saved ? JSON.parse(saved) : null;
  });

  const [token, setToken] = useState(() => localStorage.getItem('seatledger_token') || null);
  const [loading, setLoading] = useState(true);

  // Fetch current user on mount if token exists
  useEffect(() => {
    const initAuth = async () => {
      const storedToken = localStorage.getItem('seatledger_token');
      if (storedToken) {
        try {
          const res = await api.get('/auth/me');
          if (res.data.success) {
            setUser({ ...res.data.user, studentProfile: res.data.studentProfile });
            setLibrary(res.data.library);
          }
        } catch (err) {
          logout();
        }
      }
      setLoading(false);
    };
    initAuth();
  }, []);

  const completeLogin = (session) => {
    const { token: jwtToken, user: userData, library: libData, studentProfile } = session;
    if (!jwtToken || !userData) throw new Error('The server did not return a valid login session.');
    localStorage.setItem('seatledger_token', jwtToken);
    localStorage.setItem('seatledger_user', JSON.stringify({ ...userData, studentProfile }));
    localStorage.setItem('seatledger_library', JSON.stringify(libData));
    setToken(jwtToken);
    setUser({ ...userData, studentProfile });
    setLibrary(libData);
    return session;
  };

  const login = async (identifier, password) => {
    const res = await api.post('/auth/login', { identifier, password });
    if (res.data.success) return completeLogin(res.data);
    throw new Error(res.data.message || 'Login failed');
  };

  const registerLibrary = async (formData) => {
    const res = await api.post('/auth/register-library', formData);
    return res.data;
  };

  const registerStudent = async (formData) => {
    const res = await api.post('/auth/register-student', formData);
    return res.data;
  };

  const logout = () => {
    localStorage.removeItem('seatledger_token');
    localStorage.removeItem('seatledger_user');
    localStorage.removeItem('seatledger_library');
    setToken(null);
    setUser(null);
    setLibrary(null);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        library,
        token,
        loading,
        login,
        completeLogin,
        registerLibrary,
        registerStudent,
        logout,
        isAuthenticated: !!token && !!user,
        isAdmin: user?.role === 'admin' || user?.role === 'superadmin',
        isStaff: user?.role === 'staff',
        isStudent: user?.role === 'student',
      }}
    >
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
