import { useEffect } from 'react';
import useAuthStore from '../store/authStore';

export function useAuth() {
  const {
    user,
    isAuthenticated,
    isLoading,
    login,
    logout,
    initialize,
    getCurrentUser,
    hasRole,
    isAdmin,
    isOperator,
  } = useAuthStore();

  // Initialize auth state on mount
  useEffect(() => {
    initialize();
  }, [initialize]);

  return {
    user,
    isAuthenticated,
    isLoading,
    login,
    logout,
    getCurrentUser,
    hasRole,
    isAdmin,
    isOperator,
  };
}

export default useAuth;
