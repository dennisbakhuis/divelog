import { describe, expect, it } from 'vitest';
import {
  candidateLabel,
  carryChoices,
  carryTicks,
  choiceOf,
  chooseRow,
  cloudGroups,
  cloudSections,
  cloudErrorMessage,
  cloudFields,
  cloudLines,
  formatClockOffset,
  isTicked,
  joinLabel,
  joinParam,
  linkParam,
  MAX_CLOCK_OFFSET_MIN,
  nothingNew,
  onlyParam,
  parseChoice,
  parseClockOffset,
  previewAnnouncement,
  previewRows,
  selectionLine,
  setTick,
  rowOptions,
  tickedCount,
  viewRows,
  type CloudRow,
} from './cloud-import.js';
import { AdminApiError } from './client.js';
import type { ImportCandidate, ImportDive, ImportResult } from '$lib/core/dive/types.js';

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
    selected: true,
    candidates: [],
    suggested: null,
    surface_before_min: null,
    joined_to: null,
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
    const { rows } = previewRows(result(EXPORT));
    const [newest, , broken, attach] = rows;
    expect(newest).toMatchObject({
      key: '344FDE85-674',
      title: 'Perdix AI #674',
      when: '8 Aug 2026 07:44',
      facts: '32.1 m, 58 min',
      outcome: 'new draft #651',
    });
    expect(viewRows(rows, {})[0].label).toBe(
      'Perdix AI #674, 8 Aug 2026 07:44, 32.1 m, 58 min: new draft #651',
    );
    expect(attach.outcome).toBe('add profile to dive #641');
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
    expect(by(2).outcome).toBe('add profile to a logged dive');
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

function candidate(overrides: Partial<ImportCandidate> = {}): ImportCandidate {
  return {
    number: 675,
    date: '2026-08-07',
    time_in: '10:05',
    site: 'Slijk-Ewijk',
    max_depth_m: 8.2,
    minutes_apart: 5,
    ...overrides,
  };
}

const at = (start: string) => ({ start, computer_start: start });

/**
 * 660 is new but older than the newest logged dive; 672 may join 671; 673 has two candidates and
 * a suggestion; 674 may join 673 and 675 may join 674; 680 is from another computer.
 */
const DAY = [
  dive({
    computer_no: 660,
    ...at('2026-08-05T10:00:00'),
    selected: false,
    candidates: [candidate({ number: 630, date: '2026-08-05', minutes_apart: 90 })],
  }),
  dive({ computer_no: 670, ...at('2026-08-06T09:00:00'), status: 'have', dive_number: 640 }),
  dive({ computer_no: 671, ...at('2026-08-06T13:10:00'), status: 'attach', dive_number: 641 }),
  dive({
    computer_no: 672,
    ...at('2026-08-06T13:40:00'),
    max_depth_m: 6,
    duration_min: 12,
    surface_before_min: 5,
  }),
  dive({
    computer_no: 673,
    ...at('2026-08-07T10:00:00'),
    max_depth_m: 21.4,
    duration_min: 38,
    candidates: [
      candidate(),
      candidate({ number: 676, time_in: '14:00', site: null, minutes_apart: 240 }),
    ],
    suggested: 675,
  }),
  dive({
    computer_no: 674,
    ...at('2026-08-07T10:50:00'),
    max_depth_m: 24.6,
    duration_min: 20.4,
    surface_before_min: 12,
    candidates: [candidate({ number: 676, time_in: '14:00', site: null, minutes_apart: 190 })],
  }),
  dive({
    computer_no: 675,
    ...at('2026-08-07T11:30:00'),
    max_depth_m: 5,
    duration_min: 9,
    surface_before_min: 8,
  }),
  dive({ computer_no: 680, serial: 'AA11', ...at('2026-08-07T11:40:00') }),
];

describe('the default ticks and the older dives', () => {
  const preview = previewRows(result(DAY));
  const by = (n: number) => preview.rows.find((r) => r.computerNo === n)!;

  it('ticks the rows the server selected and lists the older new dives apart', () => {
    expect(preview.ticked).toEqual([680, 675, 674, 673, 672, 671]);
    expect(by(660)).toMatchObject({ selected: false, older: true });
    expect(by(671)).toMatchObject({ selected: true, older: false });
    const { current, older, broken } = cloudSections(viewRows(preview.rows, {}));
    expect(current.map((v) => v.row.computerNo)).toEqual([680, 675, 674, 673, 672, 671]);
    expect(older.map((v) => v.row.computerNo)).toEqual([660]);
    expect(broken).toEqual([]);
  });

  it('never selects an unreadable dive, and sorts the rest into the error list', () => {
    const rows = previewRows(result([dive({ status: 'error', error: 'x', selected: true })])).rows;
    expect(rows[0]).toMatchObject({ selected: false, older: false });
    expect(cloudSections(viewRows(rows, {})).broken).toHaveLength(1);
  });

  it('ticks everything readable for a server without the newer fields', () => {
    const legacy = dive();
    for (const key of ['selected', 'candidates', 'suggested', 'surface_before_min'] as const)
      delete (legacy as Partial<ImportDive>)[key];
    const before = dive({ computer_no: 673, start: '2026-08-08T06:00:00' });
    const preview = previewRows(result([before, legacy]));
    expect(preview.ticked).toEqual([674, 673]);
    expect(preview.rows[0]).toMatchObject({
      candidates: [],
      suggested: null,
      joinable: { computerNo: 673, surfaceMin: null },
    });
  });

  it('keeps a known row its tick after a new dry run and gives a new one its default', () => {
    const after = previewRows(
      result([...DAY, dive({ computer_no: 659, ...at('2026-08-04T10:00:00'), selected: false })]),
    );
    expect(carryTicks(after.rows, preview.rows, [675, 660])).toEqual([675, 660]);
    expect(carryTicks(after.rows, preview.rows, preview.ticked)).not.toContain(659);
  });
});

describe('the candidates and the suggestion', () => {
  const { rows } = previewRows(result(DAY));
  const by = (n: number) => rows.find((r) => r.computerNo === n)!;

  it('labels a candidate with what the log has', () => {
    expect(candidateLabel(candidate())).toBe('Dive #675 · 10:05 · Slijk-Ewijk · 5 min apart');
    expect(candidateLabel(candidate({ time_in: null, site: null, minutes_apart: null }))).toBe(
      'Dive #675',
    );
  });

  it('keeps candidates and the suggestion for new rows only', () => {
    expect(by(673).candidates.map((c) => c.number)).toEqual([675, 676]);
    expect(by(673).suggested).toBe(675);
    const attach = previewRows(
      result([dive({ status: 'attach', candidates: [candidate()], suggested: 675 })]),
    ).rows[0];
    expect(attach).toMatchObject({ candidates: [], suggested: null });
  });

  it('ignores a suggestion that is not among the candidates', () => {
    const odd = previewRows(result([dive({ candidates: [candidate()], suggested: 999 })])).rows[0];
    expect(odd.suggested).toBeNull();
  });

  it('defaults to the suggestion and keeps a choice only while it applies', () => {
    expect(choiceOf(by(673), {})).toBe(675);
    expect(choiceOf(by(674), {})).toBe('own');
    expect(choiceOf(by(673), { 673: 'own' })).toBe('own');
    expect(choiceOf(by(673), { 673: 676 })).toBe(676);
    expect(choiceOf(by(673), { 673: 999 })).toBe(675);
    expect(choiceOf(by(673), { 673: 'join' })).toBe(675);
  });

  it('reads a select value back', () => {
    expect(parseChoice('own')).toBe('own');
    expect(parseChoice('join')).toBe('join');
    expect(parseChoice('675')).toBe(675);
  });

  it('builds the link pairs from the rows that belong to a log dive', () => {
    expect(linkParam(rows, {})).toBe('673:675');
    expect(linkParam(rows, { 673: 'own' })).toBeUndefined();
    expect(linkParam(rows, { 674: 676, 660: 630 })).toBe('660:630,673:675,674:676');
  });

  it('says a linked row adds its profile to the dive', () => {
    const views = viewRows(rows, { 674: 676 });
    const view = (n: number) => views.find((v) => v.row.computerNo === n)!;
    expect(view(673).outcome).toBe('add profile to dive #675');
    expect(view(673).value).toBe('675');
    expect(view(673).label).toBe(
      'Perdix AI #673, 7 Aug 2026 10:00, 21.4 m, 38 min: add profile to dive #675',
    );
    expect(view(674).outcome).toBe('add profile to dive #676');
    expect(view(672).outcome).toBe('new draft #651');
    expect(view(672).value).toBe('own');
  });

  it('keeps the choices that still apply after a new dry run', () => {
    const after = previewRows(
      result(
        DAY.map((d) =>
          d.computer_no === 673
            ? { ...d, candidates: [candidate({ number: 676 })], suggested: 676 }
            : d.computer_no === 675
              ? { ...d, start: '2026-08-08T00:30:00' }
              : d,
        ),
      ),
    ).rows;
    const kept = carryChoices(after, { 673: 675, 674: 676, 672: 'own', 675: 'join', 999: 'own' });
    expect(kept).toEqual({ 674: 676, 672: 'own' });
    expect(
      choiceOf(
        after.find((r) => r.computerNo === 673)!,
        kept,
      ),
    ).toBe(676);
  });
});

describe('joining dives', () => {
  const { rows } = previewRows(result(DAY));
  const by = (n: number) => rows.find((r) => r.computerNo === n)!;
  const chain = { 674: 'join', 675: 'join' } as const;

  it('offers the dive before it from the same computer and day', () => {
    expect(by(672).joinable).toEqual({ computerNo: 671, surfaceMin: 5 });
    expect(by(674).joinable).toEqual({ computerNo: 673, surfaceMin: 12 });
    expect(by(673).joinable).toBeNull();
    expect(by(671).joinable).toBeNull();
    expect(by(680).joinable).toBeNull();
    expect(by(660).joinable).toBeNull();
    const broken = previewRows(
      result([
        dive({ computer_no: 1, ...at('2026-08-07T09:00:00'), status: 'error' }),
        dive({ computer_no: 2, ...at('2026-08-07T10:00:00') }),
        dive({ computer_no: 3, ...at('2026-08-07T11:00:00'), status: 'error' }),
      ]),
    ).rows;
    expect(broken.map((r) => r.joinable)).toEqual([null, null, null]);
  });

  it('labels the join and lists the options in order', () => {
    expect(joinLabel({ computerNo: 13, surfaceMin: 12 })).toBe(
      'Same dive as #13 (surfaced 12 min)',
    );
    expect(joinLabel({ computerNo: 13, surfaceMin: null })).toBe('Same dive as #13');
    expect(rowOptions(by(674))).toEqual([
      { value: 'own', label: 'New draft' },
      { value: 'join', label: 'Same dive as #673 (surfaced 12 min)' },
      { value: '676', label: 'Dive #676 · 14:00 · 190 min apart' },
    ]);
    expect(rowOptions(by(671))).toEqual([{ value: 'own', label: 'Dive #641 (matched)' }]);
    const attach = { ...by(672), status: 'attach' as const, diveNumber: null };
    expect(rowOptions(attach)[0].label).toBe('The logged dive it matches');
    expect(rowOptions({ ...by(672), eligible: false } as CloudRow)).toEqual([]);
  });

  it('groups a chain under its first dive and builds the join value', () => {
    expect(joinParam(rows, {})).toBeUndefined();
    expect(cloudGroups(rows, chain)).toEqual([[660], [671], [672], [673, 674, 675], [680]]);
    expect(joinParam(rows, chain)).toBe('673+674+675');
    expect(joinParam(rows, { ...chain, 672: 'join' })).toBe('671+672,673+674+675');
    expect(joinParam(rows, { 675: 'join' })).toBe('674+675');
  });

  it('shows the group on its first row and the others as part of it', () => {
    const views = viewRows(rows, { ...chain, 673: 'own' });
    const view = (n: number) => views.find((v) => v.row.computerNo === n)!;
    expect(view(673)).toMatchObject({
      joinedTo: null,
      title: 'Perdix AI #673 + #674 + #675, one dive',
      facts: '24.6 m, 67 min',
      outcome: 'new draft #651',
      label:
        'Perdix AI #673 + #674 + #675, one dive, 7 Aug 2026 10:00, 24.6 m, 67 min: new draft #651',
    });
    expect(view(674)).toMatchObject({
      joinedTo: 673,
      value: 'join',
      title: 'Perdix AI #674',
      outcome: 'same dive as #673',
    });
    expect(view(675).joinedTo).toBe(673);
    expect(view(680).joinedTo).toBeNull();
  });

  it('imports a joined row with its group and counts the group once', () => {
    const preview = previewRows(result(DAY));
    expect(isTicked(rows, chain, [673], 675)).toBe(true);
    expect(isTicked(rows, chain, [675], 675)).toBe(false);
    expect(tickedCount(rows, [673, 680], chain)).toBe(2);
    expect(selectionLine(preview, [673, 680], chain)).toBe('2 of 5 dives selected');
    expect(onlyParam(rows, [673, 680], chain)).toBe('673,674,675,680');
    expect(onlyParam(rows, [671, 672, 673, 680, 660], chain)).toBeUndefined();
  });

  it('carries the tick when a row joins or leaves a group', () => {
    const joined = chooseRow(rows, {}, [674], 674, 'join');
    expect(joined.choices).toEqual({ 674: 'join' });
    expect(joined.ticked.sort()).toEqual([673, 674]);
    expect(chooseRow(rows, {}, [673], 674, 'join').ticked).toEqual([673]);
    const left = chooseRow(rows, { 674: 'join' }, [673], 674, 'own');
    expect(left).toEqual({ choices: { 674: 'own' }, ticked: [673, 674] });
    expect(chooseRow(rows, { 674: 'join' }, [], 674, '676').ticked).toEqual([]);
    expect(isTicked(rows, {}, [999], 999)).toBe(true);
    expect(chooseRow(rows, {}, [999], 999, 'own').ticked).toEqual([999]);
  });
});

describe('the commit fields', () => {
  it('carries the links and the joins', () => {
    expect(
      cloudFields({
        dryRun: false,
        only: '673,674',
        link: '673:675',
        join: '673+674',
        clockOffsetMin: 0,
      }),
    ).toEqual({ only: '673,674', link: '673:675', join: '673+674' });
  });
});
