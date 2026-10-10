import { sequence } from '@sveltejs/kit/hooks';
import { handleDivelog } from '@divelog/kit/server';
import { divelog } from '$lib/divelog.server';
import { proxyBackend } from '$lib/proxy.server';

export const handle = sequence(
  proxyBackend(divelog),
  handleDivelog(divelog, { skip: (pathname) => pathname === '/health' }),
);
