/** Test doubles for the kit's server helpers: a divelog with a scripted backend. */
import type { RequestEvent } from '@sveltejs/kit';
import { vi } from 'vitest';
import { DEFAULT_CONFIG, type DivelogConfig } from '$lib/core/dive/config';
import { createDivelog, type Divelog } from '../server/divelog';

export type Responses = Record<string, unknown>;

/** A divelog whose `api` and `apiOrError` answer from `responses` by API path. */
export function fakeDivelog(
  responses: Responses = {},
  config: DivelogConfig = DEFAULT_CONFIG,
): Divelog {
  const divelog = createDivelog({ backendUrl: 'http://backend', config });
  const answer = (path: string) => {
    if (!(path in responses)) throw new Error(`unexpected ${path}`);
    const value = responses[path];
    if (value instanceof Error) throw value;
    return structuredClone(value);
  };
  divelog.api = vi.fn(async (_fetch: typeof fetch, path: string) => answer(path)) as Divelog['api'];
  divelog.apiOrError = vi.fn(async (_event: RequestEvent, path: string) =>
    answer(path),
  ) as Divelog['apiOrError'];
  return divelog;
}

/** A request event for `pathname`, with an optional cookie and owner. */
export function fakeEvent(
  pathname = '/',
  { cookie, owner = null }: { cookie?: string; owner?: string | null } = {},
): RequestEvent {
  const url = new URL(`http://site${pathname}`);
  const headers = new Headers(cookie ? { cookie } : {});
  return {
    url,
    fetch: vi.fn(),
    request: new Request(url, { headers }),
    locals: { owner },
  } as unknown as RequestEvent;
}

/** What a SvelteKit `error()` or `redirect()` threw, for assertions. */
export async function thrown(promise: Promise<unknown>): Promise<Record<string, unknown>> {
  try {
    await promise;
  } catch (err) {
    return err as Record<string, unknown>;
  }
  throw new Error('expected a throw');
}
