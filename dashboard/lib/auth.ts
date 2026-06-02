/**
 * Auth helpers for the web dashboard.
 * Token is stored in localStorage; user info in a separate key.
 */

export interface AuthUser {
  user_id: string;
  name: string;
  role: string;
}

const TOKEN_KEY = 'ssg_token';
const USER_KEY = 'ssg_user';

function isBrowser(): boolean {
  try {
    // Node 24 exposes partial window globals — check getItem is actually callable
    return typeof globalThis.localStorage?.getItem === 'function';
  } catch {
    return false;
  }
}

export function getToken(): string | null {
  try {
    if (!isBrowser()) return null;
    return localStorage.getItem(TOKEN_KEY);
  } catch { return null; }
}

export function getUser(): AuthUser | null {
  try {
    if (!isBrowser()) return null;
    const raw = localStorage.getItem(USER_KEY);
    return raw ? (JSON.parse(raw) as AuthUser) : null;
  } catch { return null; }
}

export function setAuth(token: string, user: AuthUser) {
  try {
    if (!isBrowser()) return;
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_KEY, JSON.stringify(user));
  } catch {}
}

export function clearAuth() {
  try {
    if (!isBrowser()) return;
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  } catch {}
}

export function isAuthenticated(): boolean {
  return !!getToken();
}

export function hasDashboardAccess(user: AuthUser | null): boolean {
  const role = (user?.role ?? '').toLowerCase();
  return role === 'staff' || role === 'admin';
}
