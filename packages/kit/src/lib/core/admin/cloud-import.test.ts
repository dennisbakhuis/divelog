import { describe, expect, it } from 'vitest';
import {
  carryTicks,
  cloudErrorMessage,
  cloudFields,
  cloudLines,
  formatClockOffset,
  MAX_CLOCK_OFFSET_MIN,
  nothingNew,
  onlyParam,
  parseClockOffset,
  previewAnnouncement,
  previewRows,
  selectionLine,
  setTick,
  tickedCount,
} from './cloud-import.js';
import { AdminApiError } from './client.js';
import type { ImportDive, ImportResult } from '$lib/core/dive/types.js';

function dive(overrides: Partial<ImportDive> = {}): ImportDive {
  return {
    computer_no: 674,
    serial: '344FDE85',
    model: 'Perdix AI',
    start: '2026-08-08T07:44:48',
    computer_start: '2026-08-08T07:44:48',
    max_depth_m: 32.1,
    duration_min: 58.4,
    status: 'new',
    dive_number: 651,
    error: null,
    ...overrides,
  };
}

function result(dives: ImportDive[], overrides: Partial<ImportResult> = {}): ImportResult {
  return {
    import_id: '',
    created: [],
    updated: [],
    skipped: 0,
    sites_created: 0,
    sites_matched: 0,
    sites: [],
    dry_run: true,
    dives_in_file: dives.length,
    first_date: '2026-08-06',
    last_date: '2026-08-08',
    dives,
    ...overrides,
  };
}

const EXPORT = [
  dive({
    computer_no: 670,
    start: '2026-08-06T09:00:00',
    computer_start: '2026-08-06T09:00:00',
    status: 'have',
    dive_number: 640,
  }),
  dive({
    computer_no: 671,
    start: '2026-08-06T13:10:00',
    computer_start: '2026-08-06T13:10:00',
    status: 'attach',
    dive_number: 641,
  }),
  dive({
    computer_no: 672,
    start: '2026-08-07T09:30:00',
    computer_start: '2026-08-07T09:30:00',
    status: 'error',
    error: 'bad blob',
    dive_number: null,
  }),
  dive({
    computer_no: 673,
    start: '2026-08-07T14:00:00',
    computer_start: '2026-08-07T14:00:00',
    dive_number: 650,
  }),
  dive(),
];

describe('parseClockOffset', () => {
  it.each([
    ['', 0],
    ['   ', 0],
    ['0', 0],
    ['+0', 0],
    ['-0', 0],
    ['+7 h', 420],
    ['-7h', -420],
    ['7', 420],
    ['+1:30', 90],
    ['-0:45', -45],
    ['-30 min', -30],
    ['90 min', 90],
    ['30m', 30],
    ['+1 h 30 min', 90],
    ['1h30', 90],
    ['2 hours 5 minutes', 125],
    ['1.5 h', 90],
    ['1,5', 90],
    ['−7 h', -420],
    ['+ 7 H', 420],
    ['24 h', 1440],
    ['-1440 min', -1440],
  ])('reads %j as %d minutes', (text, minutes) => {
    expect(parseClockOffset(text)).toBe(minutes);
  });

  it('never returns a negative zero', () => {
    expect(Object.is(parseClockOffset('-0'), 0)).toBe(true);
  });

  it.each([
    '+',
    '-',
    'h',
    'min',
    'abc',
    '7 days',
    '--7',
    '+7 h -3',
    '1:75',
    '1:3',
    '25 h',
    '1441 min',
    '-24:01',
    '7 h h',
  ])('rejects %j', (text) => {
    expect(parseClockOffset(text)).toBeNull();
  });

  it('limits the offset to a day', () => {
    expect(MAX_CLOCK_OFFSET_MIN).toBe(1440);
  });
});

describe('formatClockOffset', () => {
  it.each([
    [0, '0'],
    [420, '+7 h'],
    [-30, '-30 min'],
    [90, '+1 h 30 min'],
    [-1440, '-24 h'],
  ])('shows %d as %j', (minutes, text) => {
    expect(formatClockOffset(minutes)).toBe(text);
  });

  it('reads back what it writes', () => {
    for (const minutes of [-1440, -425, -30, 0, 5, 90, 420, 1440])
      expect(parseClockOffset(formatClockOffset(minutes))).toBe(minutes);
  });
});

describe('previewRows', () => {
  it('lists new, attach and unreadable dives newest first and counts the rest', () => {
    const preview = previewRows(result(EXPORT));
    expect(preview.rows.map((r) => [r.computerNo, r.status, r.eligible])).toEqual([
      [674, 'new', true],
      [673, 'new', true],
      [672, 'error', false],
      [671, 'attach', true],
    ]);
    expect(preview.haveCount).toBe(1);
    expect(preview.ticked).toEqual([674, 673, 671]);
  });

  it('labels a row with its date, depth, duration and outcome', () => {
    const [newest, , broken, attach] = previewRows(result(EXPORT)).rows;
    expect(newest).toMatchObject({
      key: '344FDE85-674',
      title: 'Perdix AI #674',
      when: '8 Aug 2026 07:44',
      facts: '32.1 m, 58 min',
      outcome: 'new draft #651',
      label: 'Perdix AI #674, 8 Aug 2026 07:44, 32.1 m, 58 min: new draft #651',
    });
    expect(attach.outcome).toBe('profile for #641');
    expect(broken.outcome).toBe("can't be read: bad blob");
  });

  it('shows the computer time beside the corrected one', () => {
    const [shifted] = previewRows(
      result([dive({ start: '2026-08-08T14:44:48', computer_start: '2026-08-08T07:44:48' })]),
    ).rows;
    expect(shifted.when).toBe('8 Aug 2026 14:44 (computer 07:44)');
    const [overnight] = previewRows(
      result([dive({ start: '2026-08-08T01:30:00', computer_start: '2026-08-07T23:30:00' })]),
    ).rows;
    expect(overnight.when).toBe('8 Aug 2026 01:30 (computer 7 Aug 2026 23:30)');
  });

  it('copes with missing numbers, models and messages', () => {
    const rows = previewRows(
      result([
        dive({ computer_no: 1, model: null, dive_number: null, max_depth_m: 12 }),
        dive({ computer_no: 2, status: 'attach', dive_number: null }),
        dive({ computer_no: 3, status: 'error', error: null }),
      ]),
    ).rows;
    const by = (n: number) => rows.find((r) => r.computerNo === n)!;
    expect(by(1).title).toBe('Dive #1');
    expect(by(1).outcome).toBe('new draft');
    expect(by(1).facts).toBe('12 m, 58 min');
    expect(by(2).outcome).toBe('profile for a logged dive');
    expect(by(3).outcome).toBe("can't be read: unknown error");
  });

  it('sorts dives starting together by computer number, highest first', () => {
    const rows = previewRows(result([dive({ computer_no: 5 }), dive({ computer_no: 6 })])).rows;
    expect(rows.map((r) => r.computerNo)).toEqual([6, 5]);
  });

  it('is empty for an export the log has entirely, or a result without dives', () => {
    const preview = previewRows(result([dive({ status: 'have' })]));
    expect(preview).toEqual({ rows: [], haveCount: 1, ticked: [] });
    const legacy = result([]);
    delete (legacy as Partial<ImportResult>).dives;
    expect(previewRows(legacy)).toEqual({ rows: [], haveCount: 0, ticked: [] });
  });
});

describe('ticks', () => {
  const preview = previewRows(result(EXPORT));

  it('toggles one dive', () => {
    expect(setTick([674, 673], 673, false)).toEqual([674]);
    expect(setTick([674], 673, true)).toEqual([674, 673]);
    expect(setTick([674], 674, true)).toEqual([674]);
  });

  it('counts the ticked eligible rows', () => {
    expect(tickedCount(preview.rows, preview.ticked)).toBe(3);
    expect(tickedCount(preview.rows, [672, 674])).toBe(1);
  });

  it('keeps unticked dives unticked after a new dry run and ticks new ones', () => {
    const after = previewRows(
      result([
        dive({ computer_no: 675, start: '2026-08-09T08:00:00' }),
        ...EXPORT.map((d) => (d.computer_no === 673 ? { ...d, status: 'attach' as const } : d)),
      ]),
    );
    expect(carryTicks(after.rows, preview.rows, [674, 671])).toEqual([675, 674, 671]);
  });
});

describe('onlyParam', () => {
  const { rows, ticked } = previewRows(result(EXPORT));

  it('is undefined when every eligible dive is ticked', () => {
    expect(onlyParam(rows, ticked)).toBeUndefined();
    expect(onlyParam([], [])).toBeUndefined();
  });

  it('lists the ticked computer numbers in ascending order', () => {
    expect(onlyParam(rows, [674, 671])).toBe('671,674');
    expect(onlyParam(rows, [674, 672])).toBe('674');
  });

  it('is empty when nothing is ticked', () => {
    expect(onlyParam(rows, [])).toBe('');
  });
});

describe('cloudFields', () => {
  it('leaves out the defaults', () => {
    expect(cloudFields({ dryRun: false, clockOffsetMin: 0 })).toEqual({});
  });

  it('carries the dry run, the selection and the offset', () => {
    expect(cloudFields({ dryRun: true, only: '671,674', clockOffsetMin: -420 })).toEqual({
      dry_run: 'true',
      only: '671,674',
      clock_offset_min: '-420',
    });
  });
});

describe('cloudLines', () => {
  it('spans the export and counts the dives the log has', () => {
    const res = result(EXPORT);
    expect(cloudLines(res, previewRows(res))).toEqual([
      '5 dives in the export from 2026-08-06 to 2026-08-08',
      '1 dive already in the log',
    ]);
  });

  it('names one day, or none', () => {
    const one = result([dive()], { first_date: '2026-08-08', last_date: '2026-08-08' });
    expect(cloudLines(one, previewRows(one))[0]).toBe('1 dive in the export on 2026-08-08');
    const none = result([], { first_date: null, last_date: null });
    expect(cloudLines(none, previewRows(none))).toEqual([
      '0 dives in the export',
      '0 dives already in the log',
    ]);
  });
});

describe('the selection and the empty state', () => {
  const res = result(EXPORT);
  const preview = previewRows(res);

  it('counts the selected dives', () => {
    expect(selectionLine(preview, preview.ticked)).toBe('3 of 3 dives selected');
    expect(selectionLine(preview, [674])).toBe('1 of 3 dives selected');
  });

  it('says when there is nothing new', () => {
    expect(nothingNew(preview)).toBe(false);
    const done = previewRows(result([dive({ status: 'have' }), dive({ status: 'error' })]));
    expect(nothingNew(done)).toBe(true);
  });

  it('announces the preview', () => {
    expect(previewAnnouncement(res, preview)).toBe(
      '5 dives in the export from 2026-08-06 to 2026-08-08; 1 dive already in the log; 3 of 3 dives selected',
    );
    const have = result([dive({ status: 'have' })]);
    expect(previewAnnouncement(have, previewRows(have))).toMatch(/; Nothing new to import$/);
  });
});

describe('cloudErrorMessage', () => {
  it('passes the server message on and names a too-large upload', () => {
    expect(cloudErrorMessage(new AdminApiError(400, 'Could not read export: not a ZIP'), 'x')).toBe(
      'Could not read export: not a ZIP',
    );
    expect(cloudErrorMessage(new AdminApiError(413, 'Payload Too Large'), 'x')).toBe(
      'The export is too large to upload.',
    );
    expect(cloudErrorMessage(new AdminApiError(500, ''), 'Import failed')).toBe('Import failed');
    expect(cloudErrorMessage(new TypeError('Load failed'), 'Could not read the file')).toBe(
      'Could not read the file',
    );
  });
});
