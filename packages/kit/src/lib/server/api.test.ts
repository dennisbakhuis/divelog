import { afterEach, describe, expect, it, vi } from 'vitest';
import type { RequestEvent } from '@sveltejs/kit';
import { ApiError, createApi } from './api.js';

const { api, apiOrError, backendUrl } = createApi({ backendUrl: 'http://backend:8000/' });

function response(status: number, body: unknown, json = true): Response {
  return new Response(json ? JSON.stringify(body) : String(body), {
    status,
    headers: json ? { 'content-type': 'application/json' } : {},
  });
}

function eventWith(fetchFn: typeof fetch, cookie?: string): RequestEvent {
  const headers = new Headers(cookie ? { cookie } : {});
  return { fetch: fetchFn, request: new Request('http://site/x', { headers }) } as RequestEvent;
}

describe('createApi', () => {
  afterEach(() => vi.restoreAllMocks());

  it('strips the trailing slash from the backend URL', () => {
    expect(backendUrl()).toBe('http://backend:8000');
  });

  it('reads a getter on every call', () => {
    let url = 'http://a';
    const bound = createApi({ backendUrl: () => url });
    expect(bound.backendUrl()).toBe('http://a');
    url = 'http://b/';
    expect(bound.backendUrl()).toBe('http://b');
  });

  it('forwards the cookie and parses JSON', async () => {
    const fetchFn = vi.fn().mockResolvedValue(response(200, { ok: 1 }));
    const result = await api<{ ok: number }>(fetchFn, '/api/v1/x', { cookie: 'a=b' });
    expect(result).toEqual({ ok: 1 });
    const [url, init] = fetchFn.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://backend:8000/api/v1/x');
    expect(new Headers(init.headers).get('cookie')).toBe('a=b');
    expect(new Headers(init.headers).get('accept')).toBe('application/json');
  });

  it('returns undefined on 204', async () => {
    const fetchFn = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    expect(await api(fetchFn, '/x')).toBeUndefined();
  });

  it('raises ApiError with the backend detail', async () => {
    const fetchFn = vi.fn().mockResolvedValue(response(404, { detail: 'Dive not found' }));
    await expect(api(fetchFn, '/x')).rejects.toMatchObject({
      status: 404,
      message: 'Dive not found',
    });
  });

  it('falls back to the status text on non-JSON errors', async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValue(new Response('boom', { status: 502, statusText: 'Bad Gateway' }));
    const err = await api(fetchFn, '/x').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).message).toBe('Bad Gateway');
  });
});

describe('apiOrError', () => {
  it('forwards the request cookie', async () => {
    const fetchFn = vi.fn().mockResolvedValue(response(200, [1]));
    expect(await apiOrError(eventWith(fetchFn, 's=1'), '/y')).toEqual([1]);
    const [, init] = fetchFn.mock.calls[0] as [string, RequestInit];
    expect(new Headers(init.headers).get('cookie')).toBe('s=1');
  });

  it.each([
    [404, 404, 'Not found'],
    [401, 401, 'Not signed in'],
    [500, 502, 'Backend error: nope'],
  ])('maps backend %i to a %i', async (backend, status, message) => {
    const fetchFn = vi.fn().mockResolvedValue(response(backend, { detail: 'nope' }));
    await expect(apiOrError(eventWith(fetchFn), '/y')).rejects.toMatchObject({
      status,
      body: { message },
    });
  });

  it('reports an unreachable backend as a 502', async () => {
    const fetchFn = vi.fn().mockRejectedValue(new TypeError('fetch failed'));
    await expect(apiOrError(eventWith(fetchFn), '/y')).rejects.toMatchObject({
      status: 502,
      body: { message: 'Backend unreachable' },
    });
  });
});
