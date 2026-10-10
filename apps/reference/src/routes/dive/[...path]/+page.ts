import type { PageLoad } from './$types';
import { withPublicPage } from '@divelog/kit/routes';

export const load: PageLoad = ({ data }) => withPublicPage(data);
