import { describe, expect, it } from 'vitest';
import { siteIdFor, slugify } from './slug.js';

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
