import { describe, expect, it } from 'vitest';
import { adminLoad, divePublicLoad } from './load';
import { fakeDivelog, fakeEvent, thrown } from '../testing/fake';

describe('catch-all loaders', () => {
  it('runs the matching public route and adds the owner', async () => {
    const divelog = fakeDivelog({ '/api/v1/dive/trips': [] });
    const event = fakeEvent('/dive/trips', { owner: 'me@example.com' });
    expect(await divePublicLoad(divelog, 'trips', event)).toEqual({
      trips: [],
      editHref: '/admin/trips',
      page: 'trips',
      owner: 'me@example.com',
    });
  });

  it('404s a public path without a route', async () => {
    expect(await thrown(divePublicLoad(fakeDivelog(), 'nope', fakeEvent()))).toMatchObject({
      status: 404,
    });
  });

  it('runs the matching admin route', async () => {
    const data = await adminLoad(fakeDivelog(), 'people/new', fakeEvent('/admin/people/new'));
    expect(data).toEqual({ page: 'person-new', owner: null });
  });

  it('404s an admin path without a route', async () => {
    expect(await thrown(adminLoad(fakeDivelog(), 'dives', fakeEvent()))).toMatchObject({
      status: 404,
    });
  });
});
