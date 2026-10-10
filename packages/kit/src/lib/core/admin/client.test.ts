import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  adminApi,
  adminJson,
  adminUpload,
  AdminApiError,
  configureAdminClient,
  fieldPath,
  parseFieldErrors,
} from './client.js';

function response(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('admin client', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('sends JSON bodies with credentials', async () => {
    const fetchMock = vi.fn().mockResolvedValue(response(201, { id: '1' }));
    vi.stubGlobal('fetch', fetchMock);
    const result = await adminJson<{ id: string }>('/admin/dives', 'POST', { number: 1 });
    expect(result).toEqual({ id: '1' });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/v1/admin/dives');
    expect(init.method).toBe('POST');
    expect(init.credentials).toBe('same-origin');
    expect(init.body).toBe('{"number":1}');
  });

  it('handles 204 and string errors', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 204 })));
    expect(await adminJson('/x', 'DELETE')).toBeUndefined();

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(409, { detail: 'exists' })));
    await expect(adminJson('/x')).rejects.toMatchObject({ status: 409, message: 'exists' });
  });

  it('flattens pydantic validation errors', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          response(422, { detail: [{ loc: ['body', 'max_depth_m'], msg: 'too deep' }] }),
        ),
    );
    const err = await adminJson('/x').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AdminApiError);
    expect((err as AdminApiError).message).toBe('max_depth_m: too deep');
    expect((err as AdminApiError).fieldErrors).toEqual({ max_depth_m: 'too deep' });
  });

  it('keys field errors by their dotted path, first message per field', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        response(422, {
          detail: [
            { loc: ['body', 'tanks', 0, 'o2_pct'], msg: 'at most 100' },
            { loc: ['body', 'tanks', 0, 'o2_pct'], msg: 'second message' },
            { loc: ['query', 'limit'], msg: 'too large' },
            { loc: ['body'], msg: 'whole body' },
          ],
        }),
      ),
    );
    const err = (await adminJson('/x').catch((e: unknown) => e)) as AdminApiError;
    expect(err.message).toBe(
      'tanks.0.o2_pct: at most 100; tanks.0.o2_pct: second message; limit: too large; : whole body',
    );
    expect(err.fieldErrors).toEqual({
      'tanks.0.o2_pct': 'at most 100',
      limit: 'too large',
      body: 'whole body',
    });
  });

  it('has no field errors for other failures', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(409, { detail: 'exists' })));
    const err = (await adminJson('/x').catch((e: unknown) => e)) as AdminApiError;
    expect(err.fieldErrors).toEqual({});
    expect(new AdminApiError(500, 'boom').fieldErrors).toEqual({});
  });

  it('parses field paths and ignores malformed details', () => {
    expect(fieldPath(['body', 'site', 'lat'])).toBe('site.lat');
    expect(fieldPath(['name'])).toBe('name');
    expect(fieldPath([])).toBe('');
    expect(parseFieldErrors('nope')).toEqual({});
    expect(parseFieldErrors([{ msg: 'no loc' }, { loc: ['body', 'x'] }, null])).toEqual({});
  });

  it('falls back to status text when the error body is not JSON', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('x', { status: 500, statusText: 'Server Error' })),
    );
    await expect(adminJson('/x')).rejects.toMatchObject({ message: 'Server Error' });
  });

  it('uploads multipart with query fields', async () => {
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(response(201, { id: 'a' })));
    vi.stubGlobal('fetch', fetchMock);
    const file = new File(['data'], 'photo.jpg', { type: 'image/jpeg' });
    await adminUpload('/admin/dives/1/attachments', file, { kind: 'scan' });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/v1/admin/dives/1/attachments?kind=scan');
    expect(init.body).toBeInstanceOf(FormData);
    expect((init.body as FormData).get('file')).toBeInstanceOf(File);
    await adminUpload('/plain', file);
    expect((fetchMock.mock.calls[1] as [string])[0]).toBe('/api/v1/plain');
  });
});

describe('admin client base', () => {
  afterEach(() => {
    configureAdminClient('/api/v1');
    vi.unstubAllGlobals();
  });

  it('builds owner API paths', () => {
    expect(adminApi('dives')).toBe('/admin/dives');
    expect(adminApi('dives', 650, 'attachments')).toBe('/admin/dives/650/attachments');
  });

  it('sends requests to the configured API base', async () => {
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(response(200, {})));
    vi.stubGlobal('fetch', fetchMock);
    configureAdminClient('https://api.example.org/v2/');
    await adminJson(adminApi('sites'));
    await adminUpload(adminApi('sites', 'x', 'attachments'), new File(['a'], 'a.jpg'));
    expect((fetchMock.mock.calls[0] as [string])[0]).toBe('https://api.example.org/v2/admin/sites');
    expect((fetchMock.mock.calls[1] as [string])[0]).toBe(
      'https://api.example.org/v2/admin/sites/x/attachments',
    );
  });
});
