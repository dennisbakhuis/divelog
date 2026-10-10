import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SITE_TYPE,
  SITE_TYPES,
  siteType,
  siteTypeOptions,
  waterDefault,
} from './site-types.js';

describe('site types', () => {
  it('lists each type once, the default among them', () => {
    const ids = SITE_TYPES.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toContain(DEFAULT_SITE_TYPE);
    expect(ids).toEqual(expect.arrayContaining(['quarry lake', 'cave', 'cenote', 'wreck', 'pool']));
  });

  it.each([
    ['lake', 'fresh'],
    ['quarry lake', 'fresh'],
    ['cave', 'fresh'],
    ['cenote', 'fresh'],
    ['sea', 'salt'],
    ['wreck', 'salt'],
    ['reef', 'salt'],
    [' Wreck ', 'salt'],
  ])('%s holds %s water', (type, water) => {
    expect(waterDefault(type)).toBe(water);
  });

  it('knows nothing about a type outside the list', () => {
    expect(waterDefault('fjord')).toBeNull();
    expect(waterDefault(null)).toBeNull();
    expect(siteType('')).toBeNull();
    expect(siteType('Cavern')?.label).toBe('Cavern');
  });

  it('keeps an unknown current type selectable', () => {
    expect(siteTypeOptions('sea')).toBe(SITE_TYPES);
    expect(siteTypeOptions(null)).toBe(SITE_TYPES);
    const options = siteTypeOptions('fjord');
    expect(options).toHaveLength(SITE_TYPES.length + 1);
    expect(options.at(-1)).toMatchObject({ id: 'fjord', label: 'fjord' });
  });
});
