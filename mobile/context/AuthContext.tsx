/**
 * Auth Context — stores JWT token and user info, persisted via SecureStore.
 * Wrap the app root with <AuthProvider>. Use useAuth() in any component.
 */

import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
} from 'react';
import * as SecureStore from 'expo-secure-store';
import api, { LoginResponse } from '@/services/api';

const TOKEN_KEY = 'ssg_access_token';
const USER_KEY = 'ssg_user_info';

interface AuthUser {
  user_id: string;
  name: string;
  role: string;
}

interface AuthContextValue {
  token: string | null;
  user: AuthUser | null;
  isLoading: boolean;
  login: (code: string) => Promise<void>;
  logout: () => Promise<void>;
  isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Restore session on mount
  useEffect(() => {
    (async () => {
      try {
        const savedToken = await SecureStore.getItemAsync(TOKEN_KEY);
        const savedUser = await SecureStore.getItemAsync(USER_KEY);
        if (savedToken && savedUser) {
          const parsedUser = JSON.parse(savedUser) as AuthUser;
          setToken(savedToken);
          setUser(parsedUser);
          api.setToken(savedToken);
        }
      } catch {
        // SecureStore unavailable (simulator without keychain) — ignore
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  const login = useCallback(async (code: string) => {
    const res: LoginResponse = await api.login(code);
    const userData: AuthUser = {
      user_id: res.user_id,
      name: res.name,
      role: res.role,
    };

    await SecureStore.setItemAsync(TOKEN_KEY, res.access_token);
    await SecureStore.setItemAsync(USER_KEY, JSON.stringify(userData));

    api.setToken(res.access_token);
    setToken(res.access_token);
    setUser(userData);
  }, []);

  const logout = useCallback(async () => {
    await SecureStore.deleteItemAsync(TOKEN_KEY);
    await SecureStore.deleteItemAsync(USER_KEY);
    api.setToken(null);
    setToken(null);
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider
      value={{
        token,
        user,
        isLoading,
        login,
        logout,
        isAuthenticated: !!token,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within <AuthProvider>');
  return ctx;
}
