import { describe, expect, it } from 'vitest';
import {
  flagEmoji,
  formatDate,
  formatDateRange,
  formatDepth,
  formatHours,
  formatMinutes,
  formatTemp,
  formatMonthYear,
  formatTime,
  gasLabel,
  isProvenance,
  modeLabel,
  ordinal,
  pluralize,
  siteLocation,
} from './format';

describe('formatMinutes', () => {
  it('renders hours and minutes', () => {
    expect(formatMinutes(45)).toBe('45 min');
    expect(formatMinutes(120)).toBe('2 h');
    expect(formatMinutes(125)).toBe('2 h 5 min');
  });
});

describe('formatHours', () => {
  it('drops the decimal on whole hours', () => {
    expect(formatHours(120)).toBe('2 h');
    expect(formatHours(90)).toBe('1.5 h');
  });
});

describe('depth and temperature', () => {
  it('formats with units and a dash for missing values', () => {
    expect(formatDepth(20)).toBe('20 m');
    expect(formatDepth(20.5)).toBe('20.5 m');
    expect(formatDepth(null)).toBe('—');
    expect(formatTemp(12.6)).toBe('13 °C');
    expect(formatTemp(undefined)).toBe('—');
  });
});

describe('dates and times', () => {
  it('formats ISO dates without timezone drift', () => {
    expect(formatDate('2024-05-08')).toBe('8 May 2024');
    expect(formatDate(null)).toBe('—');
    expect(formatTime('10:30:00')).toBe('10:30');
    expect(formatTime(null)).toBe('');
  });
});

describe('flagEmoji', () => {
  it('maps ISO codes to regional indicators', () => {
    expect(flagEmoji('NL')).toBe('🇳🇱');
    expect(flagEmoji('fr')).toBe('🇫🇷');
    expect(flagEmoji('XX')).toBe('');
    expect(flagEmoji('')).toBe('');
  });
});

describe('labels', () => {
  it('describes gas and mode', () => {
    expect(gasLabel('air', 21, null)).toBe('Air');
    expect(gasLabel('nitrox', 32, null)).toBe('Nitrox 32');
    expect(gasLabel('trimix', 18, 45)).toBe('Trimix 18/45');
    expect(modeLabel('sidemount')).toBe('Sidemount');
    expect(modeLabel('other')).toBe('other');
    expect(pluralize(1, 'dive')).toBe('1 dive');
    expect(pluralize(3, 'dive')).toBe('3 dives');
  });
});

describe('ordinal', () => {
  it('handles the teens', () => {
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22, 23, 101, 111].map(ordinal)).toEqual([
      '1st',
      '2nd',
      '3rd',
      '4th',
      '11th',
      '12th',
      '13th',
      '21st',
      '22nd',
      '23rd',
      '101st',
      '111th',
    ]);
  });
});

describe('formatMonthYear', () => {
  it('renders short month and year', () => {
    expect(formatMonthYear('2005-07-31')).toBe('Jul 2005');
    expect(formatMonthYear(null)).toBe('—');
  });
});

describe('siteLocation', () => {
  it('drops the site name when the area repeats it', () => {
    expect(siteLocation('Slijk-Ewijk', 'Slijk-Ewijk, Gelderland')).toBe('Slijk-Ewijk, Gelderland');
    expect(siteLocation('Zeelandbrug', 'Zierikzee, Zeeland')).toBe(
      'Zeelandbrug, Zierikzee, Zeeland',
    );
    expect(siteLocation('Ressel', null)).toBe('Ressel');
  });
});

describe('isProvenance', () => {
  it('spots a computer-only record', () => {
    expect(
      isProvenance('from dive computer (record #674); never logged on paper; tanks 1x D80\n'),
    ).toBe(true);
    expect(isProvenance('From dive computer (record #1)')).toBe(true);
  });
  it('leaves real stories alone', () => {
    expect(isProvenance('Dark and lovely.')).toBe(false);
    expect(isProvenance('from dive computer (record #1)\n\nThen we found the wreck.')).toBe(false);
    expect(isProvenance('')).toBe(false);
    expect(isProvenance(null)).toBe(false);
  });
});

describe('formatDateRange', () => {
  it('drops what start and end share', () => {
    expect(formatDateRange('2024-09-29', '2024-09-29')).toBe('29 Sep 2024');
    expect(formatDateRange('2026-02-06', '2026-02-22')).toBe('6–22 Feb 2026');
    expect(formatDateRange('2025-02-25', '2025-03-10')).toBe('25 Feb – 10 Mar 2025');
    expect(formatDateRange('2009-12-30', '2010-01-02')).toBe('30 Dec 2009 – 2 Jan 2010');
  });
});
