import { useCallback, useContext, createContext } from 'react';
import { API_URL } from '../config/constants.js';

// Temporary: Import AuthContext (will remain in FarholdApp until Phase 5)
// For now, we'll re-export these to avoid circular imports
export const AuthContext = createContext();
export const useAuth = () => useContext(AuthContext);

// ============ API HOOK ============
export function useAPI() {
  const { token, logout } = useAuth();

  const fetchAPI = useCallback(async (endpoint, options = {}) => {
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const res = await fetch(`${API_URL}${endpoint}`, {
      ...options,
      headers: { ...headers, ...options.headers },
      body: options.body ? JSON.stringify(options.body) : undefined,
    });

    const data = await res.json();
    if (!res.ok) {
      // Only logout on 401 (authentication failure), not 403 (authorization/access denied)
      if (res.status === 401) logout?.();
      throw new Error(data.error || `API error: ${res.status}`);
    }
    return data;
  }, [token, logout]);

  return { fetchAPI };
}
