import type { RequestHandler } from './$types';
import { diveOg } from '@divelog/kit/og';
import { divelog } from '$lib/divelog.server';

export const GET: RequestHandler = (event) =>
  diveOg(divelog, event.params.kind, event.params.id, event);
