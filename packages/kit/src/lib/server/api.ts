/**
 * Server-side client for the dive log backend. The SvelteKit server talks to
 * FastAPI directly (compose network or localhost); the browser never sees the
 * backend URL and uses the same-origin API path instead.
 */
import { error, type RequestEvent } from '@sveltejs/kit';

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export type Fetch = typeof fetch;

export type ApiInit = RequestInit & { cookie?: string | null };

/** A backend URL, or a getter read on every request (for runtime env). */
export type BackendUrl = string | (() => string);

export type Api = {
  /** The backend origin without a trailing slash. */
  backendUrl: () => string;
  /** Fetch JSON from the backend, forwarding the caller's cookie when given. */
  api: <T>(fetchFn: Fetch, path: string, init?: ApiInit) => Promise<T>;
  /** Load-function helper: backend errors become SvelteKit errors. */
  apiOrError: <T>(event: RequestEvent, path: string) => Promise<T>;
};

/** Bind the backend client to one backend URL. */
export function createApi({ backendUrl }: { backendUrl: BackendUrl }): Api {
  const origin = (): string =>
    (typeof backendUrl === 'function' ? backendUrl() : backendUrl).replace(/\/$/, '');

  async function api<T>(fetchFn: Fetch, path: string, init: ApiInit = {}): Promise<T> {
    const { cookie, ...rest } = init;
    const headers = new Headers(rest.headers);
    headers.set('accept', 'application/json');
    if (cookie) headers.set('cookie', cookie);
    const response = await fetchFn(`${origin()}${path}`, { ...rest, headers });
    if (!response.ok) {
      let detail = response.statusText;
      try {
        const body = (await response.json()) as { detail?: unknown };
        if (typeof body.detail === 'string') detail = body.detail;
      } catch {
        // non-JSON error body: keep the status text
      }
      throw new ApiError(response.status, detail);
    }
    if (response.status === 204) return undefined as T;
    return (await response.json()) as T;
  }

  async function apiOrError<T>(event: RequestEvent, path: string): Promise<T> {
    try {
      return await api<T>(event.fetch, path, { cookie: event.request.headers.get('cookie') });
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 404) error(404, 'Not found');
        if (err.status === 401) error(401, 'Not signed in');
        error(502, `Backend error: ${err.message}`);
      }
      error(502, 'Backend unreachable');
    }
  }

  return { backendUrl: origin, api, apiOrError };
}
