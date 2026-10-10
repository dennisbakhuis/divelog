import { describe, expect, it } from 'vitest';
import { SITE_ID, siteIdFor, slugify } from './slug.js';
import cases from './__fixtures__/site-ids.json' with { type: 'json' };

describe('slugify', () => {
  it('drops accents and collapses separators', () => {
    expect(slugify('  Cenote Dos Ojos — Été ')).toBe('cenote-dos-ojos-ete');
  });
});

describe('siteIdFor', () => {
  it('prefixes the lowercased ISO3 country', () => {
    expect(siteIdFor('MEX', 'Cenote Tortuga')).toBe('mex-cenote-tortuga');
  });
});

describe('siteIdFor and the server', () => {
  it('gives the same ids as the server site_id_for for the shared fixture', () => {
    expect(cases.length).toBeGreaterThan(5);
    for (const c of cases) expect([c.name, siteIdFor(c.country, c.name)]).toEqual([c.name, c.id]);
  });

  it('always yields an id the server accepts', () => {
    for (const c of cases) expect(SITE_ID.test(siteIdFor(c.country, c.name))).toBe(true);
    expect(siteIdFor('', '')).toBe('xxx-site');
    expect(SITE_ID.test('New Lake')).toBe(false);
  });
});
