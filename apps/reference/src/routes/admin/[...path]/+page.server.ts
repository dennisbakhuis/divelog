import type { PageServerLoad } from './$types';
import { adminLoad } from '@divelog/kit/server';
import { divelog } from '$lib/divelog.server';

export const load: PageServerLoad = (event) => adminLoad(divelog, event.params.path, event);
