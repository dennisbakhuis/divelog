import { describe, expect, it } from 'vitest';
import type { Dive, DiveListItem, Site } from '$lib/core/dive/types';
import {
  depthBars,
  diveCardSvg,
  escapeXml,
  profilePaths,
  siteCardSvg,
  withoutPrefix,
  wrapTitle,
} from './card';

const site = {
  slug: 'mex-mayan-blue',
  name: 'Cenote Mayan Blue (Escondido)',
  country_code: 'MX',
  country_name: 'Mexico',
  region: 'riviera-maya-cenotes',
  region_name: 'The Quintana Roo cenotes',
  area: 'Tulum, Quintana Roo',
  site_type: 'cave',
  max_depth_m: 23.8,
} as unknown as Site;

const dive = {
  number: 409,
  title: '',
  date: '2024-02-10',
  duration_min: 61.4,
  max_depth_m: 18.2,
  water_temp_c: 25,
  site,
  profile: [
    { t: 0, d: 0 },
    { t: 60, d: 10 },
    { t: 120, d: 18.2 },
    { t: 180, d: 0 },
  ],
} as unknown as Dive;

const item = (date: string, depth: number): DiveListItem =>
  ({ date, max_depth_m: depth }) as unknown as DiveListItem;

describe('og card', () => {
  it('escapes XML', () => {
    expect(escapeXml(`<a & "b" 'c'>`)).toBe('&lt;a &amp; &quot;b&quot; &apos;c&apos;&gt;');
  });

  it('wraps titles on word boundaries with an ellipsis when cut', () => {
    expect(wrapTitle('Slijk-Ewijk', 26)).toEqual(['Slijk-Ewijk']);
    expect(wrapTitle('Cenote Mayan Blue (Escondido)', 26)).toEqual([
      'Cenote Mayan Blue',
      '(Escondido)',
    ]);
    const long = wrapTitle('one two three four five six', 8, 2);
    expect(long).toHaveLength(2);
    expect(long[1].endsWith('…')).toBe(true);
    expect(wrapTitle('Supercalifragilisticexpialidocious', 10)[0]).toBe('Supercali…');
  });

  it('maps a profile into the box with depth downward', () => {
    const box = { x: 0, y: 100, width: 300, height: 50 };
    const paths = profilePaths(dive.profile ?? [], box);
    expect(paths?.line).toBe('M0 100 L100 127.5 L200 150 L300 100');
    expect(paths?.area).toBe('M0 100 L0 100 L100 127.5 L200 150 L300 100 L300 100 Z');
    expect(paths?.deepest).toEqual({ x: 200, y: 150, d: 18.2 });
    expect(profilePaths([{ t: 0, d: 1 }], box)).toBeNull();
    expect(
      profilePaths(
        [
          { t: 0, d: 0 },
          { t: 10, d: 0 },
        ],
        box,
      ),
    ).toBeNull();
  });

  it('downsamples long profiles but keeps the last sample', () => {
    const samples = Array.from({ length: 1000 }, (_, i) => ({ t: i, d: i % 7 }));
    const paths = profilePaths(samples, { x: 0, y: 0, width: 999, height: 6 }, 100);
    const count = paths?.line.split(/[ML]/).filter(Boolean).length ?? 0;
    expect(count).toBeLessThanOrEqual(101);
    expect(paths?.line.endsWith('L999 5')).toBe(true);
  });

  it('renders the dive card with number, site and stats', () => {
    const svg = diveCardSvg(dive, 'log.example');
    expect(svg).toContain('>log.example</text>');
    expect(svg).toContain('width="1200" height="630"');
    expect(svg).toContain('DIVE #409');
    expect(svg).toContain('Cenote Mayan Blue');
    expect(svg).toContain('10 Feb 2024 · Tulum, Quintana Roo, Mexico');
    expect(svg).toContain('18.2 m');
    expect(svg).toContain('61 min');
    expect(svg).toContain('25 °C');
    expect(svg).toContain('<circle');
  });

  it('skips the profile when there is none and escapes names', () => {
    const svg = diveCardSvg(
      {
        ...dive,
        profile: null,
        site: { ...site, name: 'A & B', area: null, region_name: null },
      } as Dive,
      'a&b.example',
    );
    expect(svg).toContain('a&amp;b.example');
    expect(svg).toContain('A &amp; B');
    expect(svg).not.toContain('<circle');
  });

  it('renders the site card with a depth bar per dive', () => {
    const dives = [item('2026-02-22', 12), item('2022-02-08', 23.8)];
    const svg = siteCardSvg(site, dives, 'log.example');
    expect(svg).toContain('>log.example</text>');
    expect(svg).toContain('DIVE SITE · CAVE');
    expect(svg).toContain('The Quintana Roo cenotes, Mexico');
    expect(svg).toContain('2022–2026');
    expect(svg.match(/<rect x=/g)).toHaveLength(2);
    expect(siteCardSvg(site, [], 'log.example')).toContain('—');
  });

  it('drops a place that repeats the title', () => {
    expect(withoutPrefix('Slijk-Ewijk, Gelderland', 'Slijk-Ewijk')).toBe('Gelderland');
    expect(withoutPrefix('Slijk-Ewijk', 'Slijk-Ewijk')).toBeNull();
    expect(withoutPrefix('Tulum', 'Mayan Blue')).toBe('Tulum');
    expect(withoutPrefix(null, 'x')).toBeNull();
  });

  it('draws no bars without dives', () => {
    expect(depthBars([], { x: 0, y: 0, width: 10, height: 10 }, 10)).toBe('');
  });
});
