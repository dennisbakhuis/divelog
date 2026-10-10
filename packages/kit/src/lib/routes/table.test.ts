import { describe, expect, it } from 'vitest';
import { defineRedirect, defineRoute, matchRoute } from './table.js';
import { fakeDivelog, fakeEvent, thrown } from '../testing/fake.js';

const a = { pattern: /^$/, name: 'a' };
const b = { pattern: /^items\/new$/, name: 'b' };
const c = { pattern: /^items\/([^/]+)$/, name: 'c' };
const d = { pattern: /^items\/([^/]+)\/parts\/(\d+)$/, name: 'd' };
const table = [a, b, c, d];

describe('matchRoute', () => {
  it('matches the mount point itself', () => {
    expect(matchRoute(table, '')).toEqual({ route: a, params: [] });
    expect(matchRoute(table, '/')).toEqual({ route: a, params: [] });
  });

  it('returns the first match in table order', () => {
    expect(matchRoute(table, 'items/new')?.route).toBe(b);
    expect(matchRoute([c, b], 'items/new')?.route).toBe(c);
  });

  it('passes the capture groups as params', () => {
    expect(matchRoute(table, 'items/x')).toEqual({ route: c, params: ['x'] });
    expect(matchRoute(table, 'items/x/parts/12')).toEqual({ route: d, params: ['x', '12'] });
  });

  it('ignores leading and trailing slashes', () => {
    expect(matchRoute(table, '/items/x/')?.params).toEqual(['x']);
  });

  it('only matches whole paths', () => {
    expect(matchRoute(table, 'items/x/parts/ab')).toBeNull();
    expect(matchRoute([{ pattern: /items/ }], 'items/x')).toBeNull();
    expect(matchRoute(table, 'nothing/here')).toBeNull();
  });
});

describe('defineRoute', () => {
  it('adds the page key and the meta built from the data', async () => {
    const route = defineRoute({
      page: 'thing',
      pattern: /^(\w+)$/,
      load: async (_divelog, [name]) => ({ name }),
      meta: ({ name }) => ({ title: name, description: `about ${name}` }),
    });
    const data = await route.load(fakeDivelog(), ['kim'], fakeEvent());
    expect(data).toEqual({
      name: 'kim',
      page: 'thing',
      meta: { title: 'kim', description: 'about kim' },
    });
  });

  it('leaves meta out when the route has none', async () => {
    const route = defineRoute({ page: 'plain', pattern: /^$/, load: async () => ({ n: 1 }) });
    expect(await route.load(fakeDivelog(), [], fakeEvent())).toEqual({ n: 1, page: 'plain' });
  });
});

describe('defineRedirect', () => {
  it('throws a redirect to the computed target', async () => {
    const route = defineRedirect({
      pattern: /^old\/(\d+)$/,
      status: 301,
      to: (divelog, [n]) => divelog.urls.dive(n),
    });
    expect(await thrown(route.load(fakeDivelog(), ['7'], fakeEvent()))).toMatchObject({
      status: 301,
      location: '/dive/7',
    });
  });
});
