import { describe, expect, it, vi } from 'vitest';
import { handleDivelog } from './handle';
import { fakeDivelog, fakeEvent, thrown } from '../testing/fake';

const ME = '/api/v1/auth/me';

function html(): Response {
  return new Response('<p>hi</p>', { headers: { 'content-type': 'text/html' } });
}

async function run(
  pathname: string,
  {
    cookie,
    signedIn = true,
    body = html,
  }: { cookie?: string; signedIn?: boolean; body?: () => Response } = {},
) {
  const divelog = fakeDivelog({
    [ME]: signedIn ? { email: 'me@example.com' } : new Error('401'),
  });
  const event = fakeEvent(pathname, { cookie });
  const resolve = vi.fn(async () => body());
  const handle = handleDivelog(divelog, { skip: (p) => p === '/health' });
  const response = Promise.resolve(handle({ event, resolve }));
  return { divelog, event, resolve, response };
}

describe('handleDivelog', () => {
  it('resolves the owner from the session cookie', async () => {
    const { event, divelog, response } = await run('/dive', { cookie: 's=1' });
    const res = await response;
    expect(event.locals.owner).toBe('me@example.com');
    expect(divelog.api).toHaveBeenCalledWith(event.fetch, ME, { cookie: 's=1' });
    expect(res.headers.get('cache-control')).toBe('private, no-store');
    expect(res.headers.get('x-robots-tag')).toBeNull();
  });

  it('leaves visitors without a cookie anonymous without asking the backend', async () => {
    const { event, divelog, response } = await run('/dive');
    const res = await response;
    expect(event.locals.owner).toBeNull();
    expect(divelog.api).not.toHaveBeenCalled();
    expect(res.headers.get('cache-control')).toBeNull();
  });

  it('treats a rejected session as signed out', async () => {
    const { event, response } = await run('/dive', { cookie: 's=old', signedIn: false });
    await response;
    expect(event.locals.owner).toBeNull();
  });

  it('sends visitors of the editor to the login page', async () => {
    const { response, resolve } = await run('/admin/dives/650');
    expect(await thrown(response)).toMatchObject({
      status: 303,
      location: '/admin/login?next=%2Fadmin%2Fdives%2F650',
    });
    expect(resolve).not.toHaveBeenCalled();
  });

  it('shows the login page to visitors, marked noindex', async () => {
    const res = await (await run('/admin/login')).response;
    expect(res.headers.get('x-robots-tag')).toBe('noindex, nofollow');
  });

  it('sends the signed-in owner from the login page to the editor', async () => {
    const { response } = await run('/admin/login', { cookie: 's=1' });
    expect(await thrown(response)).toMatchObject({ status: 303, location: '/admin' });
  });

  it('keeps editor pages out of search engines and shared caches', async () => {
    const res = await (await run('/admin/sites', { cookie: 's=1' })).response;
    expect(res.headers.get('x-robots-tag')).toBe('noindex, nofollow');
    expect(res.headers.get('cache-control')).toBe('private, no-store');
  });

  it('leaves non-HTML responses alone', async () => {
    const json = () => new Response('{}', { headers: { 'content-type': 'application/json' } });
    const res = await (await run('/admin/x', { cookie: 's=1', body: json })).response;
    expect(res.headers.get('x-robots-tag')).toBeNull();
    expect(res.headers.get('cache-control')).toBeNull();
  });

  it('skips the paths it is told to', async () => {
    const { event, divelog, response } = await run('/health', { cookie: 's=1' });
    await response;
    expect(divelog.api).not.toHaveBeenCalled();
    expect(event.locals.owner).toBeNull();
  });
});
