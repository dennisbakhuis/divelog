import type { PageLoad } from './$types';
import { withAdminPage } from '@divelog/kit/routes';

export const load: PageLoad = ({ data }) => withAdminPage(data);
