// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { diveOg } from './index.js';
import { ApiError } from '../server/api.js';
import { fakeDivelog, fakeEvent, thrown } from '../testing/fake.js';

describe('diveOg', () => {
  it.each([
    ['photo', '1'],
    ['dive', 'abc'],
    ['site', 'Upper'],
  ])('404s %s/%s without asking the backend', async (kind, id) => {
    const divelog = fakeDivelog();
    expect(await thrown(diveOg(divelog, kind, id, fakeEvent()))).toMatchObject({ status: 404 });
    expect(divelog.api).not.toHaveBeenCalled();
  });

  it('404s a dive the public API does not show', async () => {
    const divelog = fakeDivelog({ '/api/v1/dive/dives/9': new ApiError(404, 'Not found') });
    expect(await thrown(diveOg(divelog, 'dive', '9', fakeEvent()))).toMatchObject({
      status: 404,
    });
  });

  it('reports other backend failures as a 502', async () => {
    const divelog = fakeDivelog({ '/api/v1/dive/sites/x': new Error('down') });
    expect(await thrown(diveOg(divelog, 'site', 'x', fakeEvent()))).toMatchObject({
      status: 502,
    });
  });
});

describe('diveOg rendering', () => {
  it('renders a cacheable PNG card for a dive', async () => {
    const divelog = fakeDivelog({
      '/api/v1/dive/dives/409': {
        number: 409,
        title: '',
        date: '2024-02-10',
        duration_min: 61.4,
        max_depth_m: 18.2,
        water_temp_c: 25,
        site: { name: 'Cenote Mayan Blue', country_code: 'MX', country_name: 'Mexico' },
        profile: [
          { t: 0, d: 0 },
          { t: 120, d: 18.2 },
          { t: 180, d: 0 },
        ],
      },
    });
    const response = await diveOg(divelog, 'dive', '409', fakeEvent());
    expect(response.headers.get('content-type')).toBe('image/png');
    expect(response.headers.get('cache-control')).toBe('public, max-age=86400');
    const bytes = new Uint8Array(await response.arrayBuffer());
    expect([...bytes.slice(1, 4)].map((b) => String.fromCharCode(b)).join('')).toBe('PNG');
  });
});
