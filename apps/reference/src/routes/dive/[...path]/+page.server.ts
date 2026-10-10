import type { PageServerLoad } from './$types';
import { divePublicLoad } from '@divelog/kit/server';
import { divelog } from '$lib/divelog.server';

export const load: PageServerLoad = (event) => divePublicLoad(divelog, event.params.path, event);
