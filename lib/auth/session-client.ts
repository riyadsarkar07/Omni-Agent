const SESSION_STORAGE_KEY = 'omniagent_session_token';

export function saveSessionToken(token: string | undefined | null): void {
  if (typeof window === 'undefined') return;
  if (!token) return;
  try {
    window.localStorage.setItem(SESSION_STORAGE_KEY, token);
  } catch {
    // Ignore quota / private-mode failures; cookie auth remains the fallback.
  }
}

export function getSessionToken(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(SESSION_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function clearSessionToken(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(SESSION_STORAGE_KEY);
  } catch {
    // Ignore
  }
}

export function authHeaders(extra?: HeadersInit): Headers {
  const headers = new Headers(extra);
  const token = getSessionToken();
  if (token && !headers.has('Authorization') && !headers.has('authorization')) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  return headers;
}

export async function apiFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const headers = authHeaders(init?.headers);
  return fetch(input, {
    ...init,
    headers,
    credentials: 'include',
  });
}
