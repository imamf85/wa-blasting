import { create } from 'zustand';
import { authAPI } from '../services/api';

const useAuthStore = create((set) => ({
  user: null,
  token: null,
  isAuthenticated: false,
  isLoading: true,

  // Initialize auth state from localStorage
  initialize: () => {
    const token = localStorage.getItem('access_token');
    const user = localStorage.getItem('user');

    if (token && user) {
      set({
        token,
        user: JSON.parse(user),
        isAuthenticated: true,
        isLoading: false,
      });
    } else {
      set({ isLoading: false });
    }
  },

  // Login
  login: async (email, password) => {
    try {
      const response = await authAPI.login(email, password);
      const { user, session } = response.data;

      localStorage.setItem('access_token', session.access_token);
      localStorage.setItem('user', JSON.stringify(user));

      set({
        user,
        token: session.access_token,
        isAuthenticated: true,
      });

      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error.response?.data?.message || 'Login failed',
      };
    }
  },

  // Logout
  logout: async () => {
    try {
      await authAPI.logout();
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      localStorage.removeItem('access_token');
      localStorage.removeItem('user');

      set({
        user: null,
        token: null,
        isAuthenticated: false,
      });
    }
  },

  // Get current user
  getCurrentUser: async () => {
    try {
      const response = await authAPI.me();
      const user = response.data;

      localStorage.setItem('user', JSON.stringify(user));

      set({ user });

      return user;
    } catch (error) {
      console.error('Get current user error:', error);
      return null;
    }
  },

  // Check if user has role
  hasRole: (role) => {
    const { user } = useAuthStore.getState();
    if (!user) return false;

    if (Array.isArray(role)) {
      return role.includes(user.role);
    }

    return user.role === role;
  },

  // Check if user is admin
  isAdmin: () => {
    const { user } = useAuthStore.getState();
    return user?.role === 'admin';
  },

  // Check if user is operator or admin
  isOperator: () => {
    const { user } = useAuthStore.getState();
    return user?.role === 'admin' || user?.role === 'operator';
  },
}));

export default useAuthStore;
