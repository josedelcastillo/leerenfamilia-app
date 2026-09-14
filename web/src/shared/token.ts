const STORAGE_KEY = 'nplp.token';

/**
 * The family's credential, kept in `localStorage` — small, read synchronously at start-up, and
 * needed before the first render. The write queue lives in IndexedDB instead; these are two
 * different problems.
 */
export function getToken(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    // Private browsing, or storage disabled. The app still works for this session.
    return null;
  }
}

export function setToken(token: string): void {
  try {
    localStorage.setItem(STORAGE_KEY, token);
  } catch {
    /* nothing to do: the session continues with the in-memory value */
  }
}

export function clearToken(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

/**
 * Picks the token out of the WhatsApp deep link on first open, stores it, and removes it from the
 * address bar — so it does not end up in a screenshot, a shared link or the browser history.
 */
export function captureTokenFromUrl(): string | null {
  const url = new URL(window.location.href);
  const token = url.searchParams.get('t');
  if (token === null || token === '') {
    return getToken();
  }
  setToken(token);
  url.searchParams.delete('t');
  window.history.replaceState({}, '', url.toString());
  return token;
}
