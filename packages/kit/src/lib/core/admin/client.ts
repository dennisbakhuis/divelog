/**
 * Browser-side client for the owner API. Relative URLs: the Vite dev server
 * (dev) or Caddy (prod) proxies /api/* to the backend on the same origin,
 * so the session cookie rides along without any CORS.
 */
import { DEFAULT_CONFIG } from '$lib/core/dive/config.js';

let apiBase = DEFAULT_CONFIG.apiBase;

/** Point the client at the API base of the mounted dive log. */
export function configureAdminClient(base: string): void {
  apiBase = base.replace(/\/+$/, '');
}

/** One entry of a FastAPI/Pydantic 422 `detail` list. */
interface ValidationDetail {
  loc?: (string | number)[];
  msg?: string;
}

const LOC_ROOTS = new Set(['body', 'query', 'path', 'header', 'cookie']);

/**
 * The field a validation error belongs to, as a dotted path without the
 * request part: `['body', 'tanks', 0, 'o2_pct']` → `tanks.0.o2_pct`.
 */
export function fieldPath(loc: readonly (string | number)[]): string {
  const parts = loc.length > 1 && LOC_ROOTS.has(String(loc[0])) ? loc.slice(1) : loc;
  return parts.map(String).join('.');
}

/** Field errors keyed by `fieldPath`; the first message per field wins. */
export function parseFieldErrors(detail: unknown): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!Array.isArray(detail)) return errors;
  for (const d of detail as ValidationDetail[]) {
    const path = fieldPath(d?.loc ?? []);
    if (path && d?.msg && !(path in errors)) errors[path] = d.msg;
  }
  return errors;
}

export class AdminApiError extends Error {
  /** Per-field messages of a 422, keyed by dotted field path (`max_depth_m`, `tanks.0.o2_pct`). */
  public fieldErrors: Record<string, string>;

  constructor(
    public status: number,
    message: string,
    fieldErrors: Record<string, string> = {},
  ) {
    super(message);
    this.fieldErrors = fieldErrors;
  }
}

async function handle<T>(response: Response): Promise<T> {
  if (!response.ok) {
    let detail = response.statusText;
    let fieldErrors: Record<string, string> = {};
    try {
      const body = (await response.json()) as { detail?: unknown };
      if (typeof body.detail === 'string') detail = body.detail;
      else if (Array.isArray(body.detail)) {
        detail = (body.detail as ValidationDetail[])
          .map((d) => `${(d.loc ?? []).slice(1).join('.')}: ${d.msg}`)
          .join('; ');
        fieldErrors = parseFieldErrors(body.detail);
      }
    } catch {
      // keep status text
    }
    throw new AdminApiError(response.status, detail, fieldErrors);
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

/** Several files in one multipart request under one field name (`files` by default). */
export async function adminUploadMany<T>(
  path: string,
  files: readonly File[],
  fields: Record<string, string> = {},
  fieldName = 'files',
): Promise<T> {
  const form = new FormData();
  for (const file of files) form.append(fieldName, file, file.name);
  const query = new URLSearchParams(fields).toString();
  const response = await fetch(`${apiBase}${path}${query ? `?${query}` : ''}`, {
    method: 'POST',
    body: form,
    credentials: 'same-origin',
  });
  return handle<T>(response);
}
