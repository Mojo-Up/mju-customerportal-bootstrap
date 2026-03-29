import { useAuth } from '../auth/useAuth';

const API_BASE = import.meta.env.VITE_API_URL || '';

interface FetchOptions extends Omit<RequestInit, 'body'> {
  body?: unknown;
}

export function useApi() {
  const { getAccessToken } = useAuth();

  const apiFetch = async <T>(path: string, options: FetchOptions = {}): Promise<T> => {
    const token = await getAccessToken();
    const { body, ...rest } = options;

    const response = await fetch(`${API_BASE}${path}`, {
      ...rest,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        ...rest.headers,
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Request failed' }));
      throw new Error(error.error || `HTTP ${response.status}`);
    }

    return response.json();
  };

  return { apiFetch };
}

/**
 * Validate that a URL from an API response is safe to redirect to.
 * Rejects non-HTTPS URLs and optionally restricts to specific hostnames.
 */
export function isSafeRedirectUrl(url: string, allowedDomains?: string[]): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:') return false;
    if (allowedDomains) {
      return allowedDomains.some(
        (d) => parsed.hostname === d || parsed.hostname.endsWith('.' + d),
      );
    }
    return true;
  } catch {
    return false;
  }
}
