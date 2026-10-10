import { describe, expect, it } from 'vitest';
import {
  formDirty,
  formFieldsOf,
  lockedFields,
  overlayFields,
  siteFormBody,
  siteFormFrom,
  validateSiteForm,
} from './site-form.js';
import { commonsSite, fakeSite, forkSite } from '$lib/testing/sharing.js';

const FIELDS = {
  objective: ['name', 'type', 'lat', 'lon', 'access', 'country'],
  personal: ['prices', 'notes'],
  additive: ['aliases'],
  preference: ['summary'],
};

describe('site form state', () => {
  it('round-trips a site into the save body', () => {
    const site = fakeSite({
      aliases: ['A', 'B'],
      access: { lat: 52.1, lon: 5.1, note: 'stairs' },
      sources: ['One — https://x', 'Two'],
      halocline: true,
      halocline_m: 9,
    });
    const body = siteFormBody(siteFormFrom(site), site);
    expect(body).toMatchObject({
      site_id: 'nld-example',
      name: 'Example Quarry',
      aliases: ['A', 'B'],
      type: 'quarry lake',
      access: { lat: 52.1, lon: 5.1, note: 'stairs' },
      sources: ['One — https://x', 'Two'],
      halocline_m: 9,
      note: null,
      default_map: null,
    });
    const form = { ...siteFormFrom(site), halocline: false, access_lat: null, access_lon: null };
    expect(siteFormBody({ ...form, access_note: '' }, site)).toMatchObject({
      halocline_m: null,
      access: null,
    });
    expect(siteFormBody({ ...form, note: ' moved ' }, null).note).toBe('moved');
  });

  it('tells a changed form from an untouched one, the note aside', () => {
    const site = fakeSite();
    const form = siteFormFrom(site);
    expect(formDirty(form, site)).toBe(false);
    expect(formDirty({ ...form, note: 'x' }, site)).toBe(false);
    expect(formDirty({ ...form, area: 'Elsewhere' }, site)).toBe(true);
  });

  it('locks the objective fields of a commons site until it is forked', () => {
    expect(formFieldsOf('access')).toEqual(['access_lat', 'access_lon', 'access_note']);
    expect(formFieldsOf('name')).toEqual(['name']);
    const locked = lockedFields(commonsSite(), FIELDS, false);
    expect([...locked].sort()).toEqual(
      ['access_lat', 'access_lon', 'access_note', 'country', 'lat', 'lon', 'name', 'type'].sort(),
    );
    expect(lockedFields(commonsSite(), FIELDS, true).size).toBe(0);
    expect(lockedFields(commonsSite(), null, false).size).toBe(0);
    expect(lockedFields(forkSite(), FIELDS, false).size).toBe(0);
    expect(lockedFields(fakeSite(), FIELDS, false).size).toBe(0);
    expect([...overlayFields(commonsSite(), FIELDS)].sort()).toEqual(
      ['aliases', 'notes', 'prices', 'summary'].sort(),
    );
    expect(overlayFields(fakeSite(), FIELDS).size).toBe(0);
  });

  it('checks names and coordinate ranges', () => {
    const ok = siteFormFrom(fakeSite());
    expect(validateSiteForm(ok)).toEqual({});
    expect(validateSiteForm({ ...ok, name: ' ' }).name).toBeDefined();
    expect(validateSiteForm({ ...ok, lon: null }).lat).toContain('both');
    expect(validateSiteForm({ ...ok, lat: 91 }).lat).toContain('-90');
    expect(validateSiteForm({ ...ok, access_lat: 1, access_lon: null }).access).toContain('both');
    expect(validateSiteForm({ ...ok, access_lat: 1, access_lon: 200 }).access).toContain('-180');
    expect(validateSiteForm({ ...ok, country: 'NL' }).country).toContain('Three letters');
    expect(validateSiteForm({ ...ok, country: '' })).toEqual({});
  });
});
