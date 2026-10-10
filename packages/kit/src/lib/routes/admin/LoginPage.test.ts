import { afterEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, tick, unmount } from 'svelte';

vi.mock('$app/state', () => ({ page: { url: new URL('http://localhost/admin/login') } }));

import LoginPage from './LoginPage.svelte';
import { DEFAULT_CONFIG } from '$lib/core/dive/config.js';
import { divelogContext } from '$lib/core/dive/context.js';

async function signIn(devHints?: boolean): Promise<string> {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(null, { status: 204 })),
  );
  const target = document.createElement('div');
  const app = mount(LoginPage, {
    target,
    context: divelogContext({ ...DEFAULT_CONFIG, devHints }),
  });
  flushSync();
  const input = target.querySelector('input[type="email"]') as HTMLInputElement;
  input.value = 'owner@example.com';
  input.dispatchEvent(new Event('input', { bubbles: true }));
  target.querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true }));
  for (let i = 0; i < 5; i++) await tick();
  await new Promise((r) => setTimeout(r, 0));
  flushSync();
  const text = target.textContent ?? '';
  unmount(app);
  return text;
}

afterEach(() => vi.unstubAllGlobals());

describe('LoginPage', () => {
  it('points to Mailpit only when the app asks for dev hints', async () => {
    expect(await signIn(true)).toContain('Mailpit');
  });

  it('keeps the Mailpit hint out of a production sign-in', async () => {
    const text = await signIn();
    expect(text).toContain('a sign-in link is on its way');
    expect(text).not.toContain('Mailpit');
    expect(await signIn(false)).not.toContain('Mailpit');
  });
});
