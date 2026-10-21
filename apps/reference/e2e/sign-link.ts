import type { APIRequestContext } from '@playwright/test';
import { OWNER_COOKIE } from './fixtures.mjs';
import type { StubMail } from './fixtures.mjs';

/*
 * Mailed sign links for the end-to-end tests. The stub keeps one state for every worker, so a
 * test that needs an open link logs a dive of its own (dated in the past, so no template or
 * list of the other tests sees it) and asks its buddy alex to sign it.
 */

const STUB = `http://localhost:${process.env.E2E_STUB_PORT ?? 8399}`;
const OWNER = { cookie: `${OWNER_COOKIE}=1` };
export const BUDDY_MAIL = 'alex@example.com';

/** The mails the stub "sent" to `to`, oldest first. */
export async function mailsTo(request: APIRequestContext, to = BUDDY_MAIL): Promise<StubMail[]> {
  const response = await request.get(`${STUB}/_e2e/mails?to=${encodeURIComponent(to)}`);
  return (await response.json()) as StubMail[];
}

/** The site path of the newest sign link mailed for dive `n`, or null. */
export async function linkFor(
  request: APIRequestContext,
  n: number,
  to = BUDDY_MAIL,
): Promise<string | null> {
  const pattern = new RegExp(`https?://[^\\s]+/dive/${n}\\?sign=[^\\s]+`);
  const links = (await mailsTo(request, to))
    .map((mail) => pattern.exec(mail.text)?.[0])
    .filter((link): link is string => !!link);
  const last = links.at(-1);
  if (!last) return null;
  const url = new URL(last);
  return `${url.pathname}${url.search}`;
}

/** Log a dive with alex as the owner and mail alex the link to sign it; its site path. */
export async function openSignLink(request: APIRequestContext): Promise<string> {
  const number = 20_000 + Math.floor(Math.random() * 70_000);
  const created = await request.post('/api/v1/admin/dives', {
    headers: OWNER,
    data: {
      number,
      date: '2023-06-03',
      duration_min: 40,
      max_depth_m: 15,
      people_ids: ['alex'],
      visibility: 'public',
    },
  });
  if (!created.ok()) throw new Error(`creating dive ${number}: ${created.status()}`);
  const asked = await request.post(`/api/v1/admin/dives/${number}/sign-requests`, {
    headers: OWNER,
    data: { people: null, resend: false },
  });
  if (!asked.ok()) throw new Error(`asking to sign dive ${number}: ${asked.status()}`);
  const link = await linkFor(request, number);
  if (!link) throw new Error(`no sign mail for dive ${number}`);
  return link;
}
