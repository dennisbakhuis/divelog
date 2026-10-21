import { afterEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, tick, unmount } from 'svelte';

vi.mock('$app/state', () => ({ page: { url: new URL('http://localhost/admin/login') } }));

import LoginPage from './LoginPage.svelte';
import { DEFAULT_CONFIG } from '$lib/core/dive/config.js';
import { divelogContext } from '$lib/core/dive/context.js';

async function signIn(
  devHints?: boolean,
  reply: () => Response = () => new Response(null, { status: 204 }),
): Promise<string> {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => reply()),
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

  it('says how long the link lives, from the 202 body', async () => {
    const text = await signIn(false, () => Response.json({ valid_minutes: 2 }, { status: 202 }));
    expect(text).toContain('It is valid for 2 minutes.');
    expect(text).not.toContain('15 minutes');
  });

  it('says a few minutes when the server does not say', async () => {
    const legacy = () => Response.json({ status: 'sent' }, { status: 202 });
    expect(await signIn(false, legacy)).toContain('It is valid for a few minutes.');
    expect(await signIn(false)).toContain('It is valid for a few minutes.');
    const odd = () => Response.json({ valid_minutes: 'soon' }, { status: 202 });
    expect(await signIn(false, odd)).toContain('It is valid for a few minutes.');
  });

  it.each([0, -3, 2.5, 1e21, 1441, null, true, '2', [2], { n: 2 }])(
    'says a few minutes for a valid_minutes of %j',
    async (odd) => {
      const reply = () => Response.json({ valid_minutes: odd }, { status: 202 });
      const text = await signIn(false, reply);
      expect(text).toContain('It is valid for a few minutes.');
    },
  );

  it('says a few minutes for a body that is not an object', async () => {
    for (const body of [null, 'sent', 7, [2]]) {
      const text = await signIn(false, () => Response.json(body, { status: 202 }));
      expect(text).toContain('It is valid for a few minutes.');
    }
  });

  it('says one minute in the singular', async () => {
    const one = () => Response.json({ valid_minutes: 1 }, { status: 202 });
    expect(await signIn(false, one)).toContain('It is valid for 1 minute.');
  });
});
