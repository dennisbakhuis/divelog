import { describe, expect, it } from 'vitest';
import {
  applySplits,
  breakLabel,
  candidateLabel,
  carryPartChoices,
  carrySplits,
  carryChoices,
  carryTicks,
  choiceOf,
  chooseRow,
  cloudGroups,
  cloudSections,
  cloudErrorMessage,
  cloudFields,
  cloudLines,
  chooseSplit,
  formatClockOffset,
  isTicked,
  joinLabel,
  joinParam,
  linkParam,
  MAX_CLOCK_OFFSET_MIN,
  needsSplitRun,
  nothingNew,
  onlyParam,
  parseChoice,
  parseClockOffset,
  partChoiceOf,
  previewAnnouncement,
  previewRows,
  selectionLine,
  setTick,
  rowOptions,
  splitParam,
  tickedCount,
  viewRows,
  type CloudRow,
} from './cloud-import.js';
import { AdminApiError } from './client.js';
import type {
  ImportBreak,
  ImportCandidate,
  ImportDive,
  ImportPart,
  ImportResult,
} from '$lib/core/dive/types.js';

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
    breaks: [],
    parts: [],
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
    for (const key of [
      'selected',
      'candidates',
      'suggested',
      'surface_before_min',
      'breaks',
      'parts',
    ] as const)
      delete (legacy as Partial<ImportDive>)[key];
    const before = dive({ computer_no: 673, start: '2026-08-08T06:00:00' });
    const preview = previewRows(result([before, legacy]));
    expect(preview.ticked).toEqual([674, 673]);
    expect(preview.rows[0]).toMatchObject({
      candidates: [],
      suggested: null,
      joinable: { computerNo: 673, surfaceMin: null },
      breaks: [],
      parts: [],
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
  it('carries the splits', () => {
    expect(cloudFields({ dryRun: true, split: '614@1740', clockOffsetMin: 0 })).toEqual({
      dry_run: 'true',
      split: '614@1740',
    });
  });

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

function surface(overrides: Partial<ImportBreak> = {}): ImportBreak {
  return {
    start_s: 1740,
    end_s: 2340,
    minutes: 10,
    start: '11:48',
    end: '11:58',
    suggested: true,
    ...overrides,
  };
}

function piece(overrides: Partial<ImportPart> = {}): ImportPart {
  return {
    part: 1,
    start: '2026-08-09T11:19:00',
    duration_min: 29,
    max_depth_m: 18.4,
    status: 'attach',
    dive_number: 611,
    candidates: [],
    suggested: null,
    ...overrides,
  };
}

const LATE = surface({ start_s: 3970, end_s: 4090, minutes: 2, start: '12:25', end: '12:27' });

/**
 * 614 has a suggested break at 29 min and another at 66 min, and a candidate; 615 may join it;
 * 613 may join 612 and has no breaks; 616 is unreadable.
 */
const CAVE = [
  dive({ computer_no: 612, ...at('2026-08-09T09:00:00') }),
  dive({ computer_no: 613, ...at('2026-08-09T10:00:00'), surface_before_min: 2 }),
  dive({
    computer_no: 614,
    ...at('2026-08-09T11:19:00'),
    surface_before_min: 21,
    candidates: [candidate({ number: 611, date: '2026-08-09', time_in: '11:20' })],
    suggested: 611,
    breaks: [surface(), { ...LATE, suggested: false }],
  }),
  dive({ computer_no: 615, ...at('2026-08-09T13:00:00'), surface_before_min: 20 }),
  dive({
    computer_no: 616,
    ...at('2026-08-09T15:00:00'),
    status: 'error',
    error: 'bad blob',
    breaks: [surface()],
  }),
];

const CUT = [
  piece(),
  piece({
    part: 2,
    start: '2026-08-09T11:58:00',
    duration_min: 42.84,
    max_depth_m: 13.2,
    status: 'new',
    dive_number: 652,
    candidates: [
      candidate({ number: 612, date: '2026-08-09', time_in: '12:00', minutes_apart: 2 }),
      candidate({ number: 618, date: '2026-08-09', time_in: '16:00', site: null }),
    ],
    suggested: 612,
  }),
];

const cutAt = (split: string, parts: ImportPart[] = CUT) =>
  previewRows(result(CAVE.map((d) => (d.computer_no === 614 ? { ...d, parts } : d))), split).rows;

describe('splitting a dive', () => {
  const raw = previewRows(result(CAVE)).rows;
  const by = (rows: CloudRow[], n: number) => rows.find((r) => r.computerNo === n)!;

  it('labels a break by when it starts in the dive, how long and the wall clock', () => {
    expect(breakLabel(surface())).toBe('29 min · surfaced 10 min (11:48–11:58)');
    expect(breakLabel(surface({ start_s: 3040 }))).toBe('51 min · surfaced 10 min (11:48–11:58)');
  });

  it('keeps the breaks of readable rows and the cut the dry run sent', () => {
    expect(by(raw, 614).breaks).toEqual([
      { startS: 1740, suggested: true, label: '29 min · surfaced 10 min (11:48–11:58)' },
      { startS: 3970, suggested: false, label: '66 min · surfaced 2 min (12:25–12:27)' },
    ]);
    expect(by(raw, 614)).toMatchObject({ split: [], cut: [], parts: [] });
    expect(by(raw, 616).breaks).toEqual([]);
    const cut = by(cutAt('614@3970,614@1740,612@99'), 614);
    expect(cut.cut).toEqual([1740, 3970]);
    expect(by(cutAt('614@1740'), 616).cut).toEqual([]);
  });

  it('describes each part', () => {
    const [first, second] = by(cutAt('614@1740'), 614).parts;
    expect(first).toMatchObject({
      key: '614.1',
      part: 1,
      status: 'attach',
      title: 'Part 1 · 11:19 · 29 min · 18.4 m',
      outcome: 'add profile to dive #611',
      candidates: [],
      suggested: null,
    });
    expect(second).toMatchObject({
      key: '614.2',
      title: 'Part 2 · 11:58 · 42.8 min · 13.2 m',
      outcome: 'new draft #652',
      suggested: 612,
    });
    const odd = by(cutAt('614@1740', [piece({ status: 'new', suggested: 999 })]), 614).parts[0];
    expect(odd.suggested).toBeNull();
    const legacy = piece({ status: 'new' });
    delete (legacy as Partial<ImportPart>).candidates;
    delete (legacy as Partial<ImportPart>).suggested;
    expect(by(cutAt('614@1740', [legacy]), 614).parts[0]).toMatchObject({
      candidates: [],
      suggested: null,
    });
  });

  it('splits at the suggested breaks unless the owner chose otherwise', () => {
    const rows = applySplits(raw, {}, {});
    expect(by(rows, 614)).toMatchObject({
      split: [1740],
      joinable: null,
      candidates: [],
      suggested: null,
    });
    expect(by(rows, 615).joinable).toBeNull();
    expect(by(rows, 613).joinable).toEqual({ computerNo: 612, surfaceMin: 2 });
    expect(by(rows, 616).split).toEqual([]);
    expect(by(applySplits(raw, { 614: [3970, 1740] }, {}), 614).split).toEqual([1740, 3970]);
    expect(by(applySplits(raw, { 614: [5000] }, {}), 614).split).toEqual([]);
    const whole = applySplits(raw, { 614: [] }, {});
    expect(by(whole, 614)).toMatchObject({ split: [], suggested: 611 });
    expect(by(whole, 615).joinable).toEqual({ computerNo: 614, surfaceMin: 20 });
  });

  it('lets a join win over a suggested break, and a ticked break over a join', () => {
    const joined = applySplits(raw, {}, { 615: 'join' });
    expect(by(joined, 614).split).toEqual([]);
    expect(by(joined, 615).joinable).toEqual({ computerNo: 614, surfaceMin: 20 });
    expect(joinParam(joined, { 615: 'join' })).toBe('614+615');
    const both = applySplits(raw, { 614: [1740] }, { 615: 'join' });
    expect(by(both, 615).joinable).toBeNull();
    expect(joinParam(both, { 615: 'join' })).toBeUndefined();
    expect(by(applySplits(raw, {}, { 614: 'join' }), 614).split).toEqual([]);
  });

  it('builds the split value and knows when the dry run is out of date', () => {
    expect(splitParam(raw)).toBeUndefined();
    expect(splitParam(applySplits(raw, {}, {}))).toBe('614@1740');
    expect(splitParam(applySplits(raw, { 614: [1740, 3970] }, {}))).toBe('614@1740,614@3970');
    expect(needsSplitRun(raw)).toBe(false);
    expect(needsSplitRun(applySplits(raw, {}, {}))).toBe(true);
    expect(needsSplitRun(applySplits(cutAt('614@1740'), {}, {}))).toBe(false);
    expect(needsSplitRun(applySplits(cutAt('614@1740'), { 614: [] }, {}))).toBe(true);
  });

  it('ticks and unticks one break, keeping the others', () => {
    const row = by(applySplits(raw, {}, {}), 614);
    expect(chooseSplit({}, row, 3970, true)).toEqual({ 614: [1740, 3970] });
    expect(chooseSplit({}, row, 1740, false)).toEqual({ 614: [] });
    expect(chooseSplit({ 613: [] }, row, 1740, true)).toEqual({ 613: [], 614: [1740] });
  });

  it('shows the Split control on a row alone, the parts once the dry run cut it', () => {
    const shown = (rows: CloudRow[], choices = {}, parts = {}) =>
      viewRows(rows, choices, parts).find((v) => v.row.computerNo === 614)!;
    const before = shown(applySplits(raw, {}, {}));
    expect(before.breaks).toEqual([
      {
        startS: 1740,
        suggested: true,
        label: '29 min · surfaced 10 min (11:48–11:58)',
        checked: true,
      },
      {
        startS: 3970,
        suggested: false,
        label: '66 min · surfaced 2 min (12:25–12:27)',
        checked: false,
      },
    ]);
    expect(before.outcome).toBe('split into 2 dives');
    expect(before.options).toEqual([{ value: 'own', label: 'New draft' }]);
    expect(before.parts).toEqual([]);
    const after = shown(applySplits(cutAt('614@1740'), {}, {}), {}, { '614.2': 618 });
    expect(after.parts.map((p) => [p.part.key, p.value, p.outcome])).toEqual([
      ['614.1', 'own', 'add profile to dive #611'],
      ['614.2', '618', 'add profile to dive #618'],
    ]);
    expect(after.parts[1].options).toEqual([
      { value: 'own', label: 'New draft' },
      { value: '612', label: 'Dive #612 · 12:00 · Slijk-Ewijk · 2 min apart' },
      { value: '618', label: 'Dive #618 · 16:00 · 5 min apart' },
    ]);
    expect(shown(applySplits(cutAt('614@1740'), { 614: [] }, {})).parts).toEqual([]);
    const views = viewRows(applySplits(raw, {}, { 615: 'join' }), { 615: 'join' });
    expect(views.find((v) => v.row.computerNo === 614)!.breaks).toEqual([]);
    expect(views.find((v) => v.row.computerNo === 615)!.breaks).toEqual([]);
    expect(views.find((v) => v.row.computerNo === 616)!.breaks).toEqual([]);
  });

  it('links the parts of a split dive instead of the dive', () => {
    const rows = applySplits(cutAt('614@1740'), {}, {});
    expect(linkParam(rows, { 614: 611 })).toBe('614.2:612');
    expect(linkParam(rows, {}, { '614.2': 'own' })).toBeUndefined();
    expect(linkParam(rows, { 613: 618 }, { '614.1': 618, '614.2': 618 })).toBe('614.2:618');
    const stale = applySplits(cutAt('614@1740'), { 614: [1740, 3970] }, {});
    expect(linkParam(stale, {})).toBeUndefined();
  });

  it('defaults a part to its suggestion and keeps a choice while it applies', () => {
    const [first, second] = by(cutAt('614@1740'), 614).parts;
    expect(partChoiceOf(second, {})).toBe(612);
    expect(partChoiceOf(second, { '614.2': 'own' })).toBe('own');
    expect(partChoiceOf(second, { '614.2': 'join' })).toBe(612);
    expect(partChoiceOf(first, { '614.1': 612 })).toBe('own');
  });

  it('carries the ticks of breaks that still exist and part choices of the same cut', () => {
    const after = previewRows(
      result(CAVE.map((d) => (d.computer_no === 614 ? { ...d, breaks: [surface()] } : d))),
    ).rows;
    expect(carrySplits(after, { 614: [1740, 3970], 613: [1], 999: [1] })).toEqual({ 614: [1740] });
    const cut = cutAt('614@1740');
    const choices = { '614.2': 618, '614.1': 'own' as const, '614.3': 612 };
    expect(carryPartChoices(cut, cut, choices)).toEqual({ '614.2': 618, '614.1': 'own' });
    expect(carryPartChoices(cut, cutAt('614@1740,614@3970'), choices)).toEqual({});
    expect(carryPartChoices(cut, raw, choices)).toEqual({});
  });

  it('counts a split dive once per part and names it in the announcement', () => {
    const report = result(CAVE);
    const rows = applySplits(raw, {}, {});
    const preview = { ...previewRows(report), rows };
    expect(tickedCount(rows, [612, 613, 614, 615])).toBe(5);
    expect(selectionLine(preview, [614])).toBe('2 of 5 dives selected');
    expect(onlyParam(rows, [612, 613, 614, 615])).toBeUndefined();
    expect(previewAnnouncement(report, preview, [614])).toBe(
      '5 dives in the export from 2026-08-06 to 2026-08-08; 0 dives already in the log; ' +
        '2 of 5 dives selected; Perdix AI #614 split into 2 dives',
    );
  });
});
