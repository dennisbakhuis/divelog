import type { PageServerLoad } from './$types';
import { loadDiveSummary } from '@divelog/kit/widgets';
import { divelog } from '$lib/divelog.server';

export const load: PageServerLoad = ({ fetch }) => loadDiveSummary(divelog, fetch);
