import { describe, expect, it } from 'vitest';
import { createUrls, DEFAULT_CONFIG } from '$lib/core/dive/config.js';
import { diveOgImageFor } from './seo.js';

describe('diveOgImageFor', () => {
  const urls = createUrls(DEFAULT_CONFIG);

  it('gives dive and site pages their card', () => {
    expect(diveOgImageFor(urls, '/dive/12')).toBe('/dive/og/dive/12.png');
    expect(diveOgImageFor(urls, '/dive/sites/fra-ressel/')).toBe('/dive/og/site/fra-ressel.png');
  });

  it('is null for every other page', () => {
    expect(diveOgImageFor(urls, '/dive')).toBeNull();
    expect(diveOgImageFor(urls, '/dive/sites')).toBeNull();
    expect(diveOgImageFor(urls, '/dive/12/og.png')).toBeNull();
    expect(diveOgImageFor(urls, '/blog/a')).toBeNull();
  });

  it('follows the base path', () => {
    const moved = createUrls({ ...DEFAULT_CONFIG, basePath: '/log' });
    expect(diveOgImageFor(moved, '/log/4')).toBe('/log/og/dive/4.png');
    expect(diveOgImageFor(moved, '/dive/4')).toBeNull();
  });
});
