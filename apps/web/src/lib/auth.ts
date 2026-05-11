import type { AuthUser, LoginResponse } from '@hj/shared-types';

const TOKEN_KEY = 'hj-token';
const USER_KEY = 'hj-user';

export function saveSession(res: LoginResponse) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(TOKEN_KEY, res.accessToken);
  localStorage.setItem(USER_KEY, JSON.stringify(res.user));
}

export function clearSession() {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

export function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(TOKEN_KEY);
}

export function getUser(): AuthUser | null {
  if (typeof window === 'undefined') return null;
  const raw = localStorage.getItem(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AuthUser;
  } catch {
    return null;
  }
}
