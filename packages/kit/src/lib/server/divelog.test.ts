import { afterEach, describe, expect, it, vi } from 'vitest';
import type { RequestEvent } from '@sveltejs/kit';
import { DEFAULT_CONFIG } from '$lib/core/dive/config';
import { checkServerVersion, createDivelog, majorOf, SUPPORTED_API } from './divelog';

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function backend(version: unknown) {
  return vi.fn(async (input: RequestInfo | URL) =>
    String(input).endsWith('/api/v1/version') ? json(version) : json({ ok: true }),
  );
}

describe('majorOf', () => {
  it('reads numbers and dotted strings', () => {
    expect(majorOf(1)).toBe(1);
    expect(majorOf('2.3')).toBe(2);
    expect(majorOf(undefined)).toBeNull();
    expect(majorOf('x')).toBeNull();
  });
});

describe('checkServerVersion', () => {
  it('accepts the supported major and servers without an api field', () => {
    const warn = vi.fn();
    expect(checkServerVersion({ api: SUPPORTED_API }, warn)).toBe(true);
    expect(checkServerVersion({ version: '0.9.0' }, warn)).toBe(true);
    expect(warn).not.toHaveBeenCalled();
  });

  it('warns on another major', () => {
    const warn = vi.fn();
    expect(checkServerVersion({ version: '3.0.0', api: 2 }, warn)).toBe(false);
    expect(warn.mock.calls[0][0]).toContain('reports API 2');
  });
});

describe('createDivelog version contract', () => {
  afterEach(() => vi.restoreAllMocks());

  it('fetches the version once, lazily, and caches it', async () => {
    const divelog = createDivelog({ backendUrl: 'http://b', config: DEFAULT_CONFIG });
    const fetchFn = backend({ version: '1.0.0', format: 1, api: 1 });
    expect(fetchFn).not.toHaveBeenCalled();
    await divelog.api(fetchFn, '/api/v1/dive/stats');
    await divelog.api(fetchFn, '/api/v1/dive/stats');
    expect(await divelog.serverVersion()).toEqual({ version: '1.0.0', format: 1, api: 1 });
    const versionCalls = fetchFn.mock.calls.filter(([url]) => String(url).endsWith('/version'));
    expect(versionCalls).toHaveLength(1);
  });

  it('logs a warning on a major mismatch', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const divelog = createDivelog({ backendUrl: 'http://b', config: DEFAULT_CONFIG });
    const fetchFn = backend({ version: '9.0.0', api: 9 });
    const event = {
      fetch: fetchFn,
      request: new Request('http://site/'),
    } as unknown as RequestEvent;
    await divelog.apiOrError(event, '/api/v1/dive/stats');
    await divelog.serverVersion();
    expect(warn).toHaveBeenCalledOnce();
  });

  it('retries after an unreachable server', async () => {
    const divelog = createDivelog({ backendUrl: 'http://b', config: DEFAULT_CONFIG });
    const down = vi.fn().mockRejectedValue(new TypeError('fetch failed'));
    expect(await divelog.serverVersion(down)).toBeNull();
    expect(await divelog.serverVersion(backend({ version: '1.0.0' }))).toEqual({
      version: '1.0.0',
    });
  });
});
