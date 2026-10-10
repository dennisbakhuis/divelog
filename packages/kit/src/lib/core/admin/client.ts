/**
 * Browser-side client for the owner API. Relative URLs: the Vite dev server
 * (dev) or Caddy (prod) proxies /api/* to the backend on the same origin,
 * so the session cookie rides along without any CORS.
 */
import { DEFAULT_CONFIG } from '$lib/core/dive/config';

let apiBase = DEFAULT_CONFIG.apiBase;

/** Point the client at the API base of the mounted dive log. */
export function configureAdminClient(base: string): void {
  apiBase = base.replace(/\/+$/, '');
}

export class AdminApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

async function handle<T>(response: Response): Promise<T> {
  if (!response.ok) {
    let detail = response.statusText;
    try {
      const body = (await response.json()) as { detail?: unknown };
      if (typeof body.detail === 'string') detail = body.detail;
      else if (Array.isArray(body.detail)) {
        detail = body.detail
          .map(
            (d: { loc?: unknown[]; msg?: string }) =>
              `${(d.loc ?? []).slice(1).join('.')}: ${d.msg}`,
          )
          .join('; ');
      }
    } catch {
      // keep status text
    }
    throw new AdminApiError(response.status, detail);
  }
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

/** A path under the owner API, relative to the API base: `adminApi('dives', 650)`. */
export function adminApi(...segments: (string | number)[]): string {
  return ['', 'admin', ...segments].join('/');
}

export async function adminJson<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
  const response = await fetch(`${apiBase}${path}`, {
    method,
    headers: body !== undefined ? { 'content-type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    credentials: 'same-origin',
  });
  return handle<T>(response);
}

export async function adminUpload<T>(
  path: string,
  file: File,
  fields: Record<string, string> = {},
): Promise<T> {
  const form = new FormData();
  form.set('file', file, file.name);
  const query = new URLSearchParams(fields).toString();
  const response = await fetch(`${apiBase}${path}${query ? `?${query}` : ''}`, {
    method: 'POST',
    body: form,
    credentials: 'same-origin',
  });
  return handle<T>(response);
}
