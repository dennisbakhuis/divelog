import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, tick, unmount } from 'svelte';

vi.mock('$app/navigation', () => ({ invalidateAll: vi.fn(async () => {}) }));

import { invalidateAll } from '$app/navigation';
import AdminImportPage from './AdminImportPage.svelte';
import { CLOUD_EXPORT_HELP } from '$lib/core/admin/cloud-import.js';
import type { ImportDive, ImportPart, ImportResult } from '$lib/core/dive/types.js';
import { registerLiveRegion, resetAnnouncer } from '$lib/core/ui/announce.js';

function report(overrides: Partial<ImportResult> = {}): ImportResult {
  return {
    import_id: '',
    created: [651, 652],
    updated: [650],
    skipped: 0,
    sites_created: 0,
    sites_matched: 0,
    sites: [],
    dry_run: true,
    dives_in_file: 3,
    first_date: '2026-02-07',
    last_date: '2026-02-08',
    dives: [],
    ...overrides,
  };
}

const calls: { url: string; files: string[] }[] = [];

beforeEach(() => {
  calls.length = 0;
  vi.mocked(invalidateAll).mockClear();
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit = {}) => {
      const body = init.body as FormData;
      calls.push({ url, files: [...body.values()].map((f) => (f as File).name) });
      const dry = url.includes('dry_run=true');
      return new Response(JSON.stringify(report(dry ? {} : { dry_run: false, import_id: 'abc' })));
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.innerHTML = '';
});

function render() {
  const target = document.createElement('div');
  document.body.append(target);
  const app = mount(AdminImportPage, {
    target,
    props: {
      data: {
        page: 'import' as const,
        owner: 'owner@example.com',
        imports: [
          {
            id: 'i1',
            format: 'shearwater',
            original_name: 'perdix.xml',
            created_at: '2026-02-01T10:00:00',
            created: [600],
            updated: [],
            url: '/media/imports/i1.xml',
          },
        ],
      },
    },
  });
  flushSync();
  return { target, app };
}

async function settle() {
  for (let i = 0; i < 4; i++) await tick();
  await new Promise((r) => setTimeout(r, 0));
  flushSync();
}

function choose(input: HTMLInputElement, files: File[]) {
  Object.defineProperty(input, 'files', { value: files, configurable: true });
  input.dispatchEvent(new Event('change', { bubbles: true }));
}

/** The file input of the card named `name`, found by its label rather than its position. */
function fileInput(target: HTMLElement, name: string): HTMLInputElement {
  const input = [...target.querySelectorAll<HTMLInputElement>('input[type=file]')].find(
    (i) => i.closest('label')?.querySelector('strong')?.textContent === name,
  );
  if (!input) throw new Error(`no file input labelled ${name}`);
  return input;
}

const xml = (name: string) => new File(['<dive/>'], name, { type: 'text/xml' });

describe('AdminImportPage', () => {
  it('previews a dry run, then imports the same files and links the drafts', async () => {
    const { target, app } = render();
    const perdix = fileInput(target, 'Shearwater Perdix');
    choose(perdix, [xml('a.xml'), xml('b.xml')]);
    await settle();
    expect(calls[0]).toEqual({
      url: '/api/v1/admin/import/shearwater?dry_run=true',
      files: ['a.xml', 'b.xml'],
    });
    const preview = target.querySelector('.preview')!;
    expect(preview.textContent).toContain('Shearwater Perdix, 2 files');
    expect(preview.textContent).toContain('3 dives in the file from 2026-02-07 to 2026-02-08');
    expect(preview.textContent).toContain('2 new drafts would be created');
    expect(preview.textContent).toContain('#651, #652');
    expect(invalidateAll).not.toHaveBeenCalled();

    const commit = [...preview.querySelectorAll('button')].find((b) => b.textContent === 'Import')!;
    commit.click();
    await settle();
    expect(calls[1]).toEqual({
      url: '/api/v1/admin/import/shearwater',
      files: ['a.xml', 'b.xml'],
    });
    expect(target.querySelector('.preview')).toBeNull();
    const done = target.querySelector('.done')!;
    expect(done.textContent).toContain('2 new drafts created');
    const links = [...done.querySelectorAll('.created a')].map((a) => a.getAttribute('href'));
    expect(links).toEqual(['/admin/dives/651', '/admin/dives/652']);
    expect(done.querySelector('a[href="/admin/dives?status=draft"]')?.textContent).toBe(
      'Review drafts',
    );
    expect(invalidateAll).toHaveBeenCalledOnce();
    unmount(app);
  });

  it('sends a Subsurface file on its own and can cancel the preview', async () => {
    const { target, app } = render();
    const subsurface = fileInput(target, 'Subsurface');
    choose(subsurface, [xml('log.ssrf')]);
    await settle();
    expect(calls[0]).toEqual({
      url: '/api/v1/admin/import/subsurface?dry_run=true',
      files: ['log.ssrf'],
    });
    const cancel = [...target.querySelectorAll('button')].find((b) => b.textContent === 'Cancel')!;
    cancel.click();
    flushSync();
    expect(target.querySelector('.preview')).toBeNull();
    expect(calls).toHaveLength(1);
    unmount(app);
  });

  it('shows an error when the file cannot be read', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () => new Response(JSON.stringify({ detail: 'Not a dive log' }), { status: 400 }),
      ),
    );
    const { target, app } = render();
    choose(fileInput(target, 'Shearwater Perdix'), [xml('x.xml')]);
    await settle();
    expect(target.querySelector('[role=alert]')?.textContent).toBe('Not a dive log');
    expect(target.querySelector('.preview')).toBeNull();
    unmount(app);
  });

  it('lists the previous imports', () => {
    const { target, app } = render();
    expect(target.querySelector('tbody')?.textContent).toContain('perdix.xml');
    unmount(app);
  });

  it('offers the Shearwater Cloud export first, without an accept filter', () => {
    const { target, app } = render();
    const inputs = target.querySelectorAll<HTMLInputElement>('input[type=file]');
    expect(inputs).toHaveLength(3);
    const cloud = fileInput(target, 'Shearwater Cloud export');
    expect(inputs[0]).toBe(cloud);
    expect(cloud.hasAttribute('accept')).toBe(false);
    expect(cloud.multiple).toBe(false);
    const card = cloud.closest('.cloud')!;
    expect(card.textContent).toContain('Shearwater Cloud export');
    expect(card.textContent).toContain('Choose the exported .db file');
    expect(card.textContent).not.toContain('Export account');
    const steps = document.getElementById(cloud.getAttribute('aria-describedby')!);
    expect(steps?.textContent).toBe(CLOUD_EXPORT_HELP);
    unmount(app);
  });

  describe('a Shearwater Cloud export', () => {
    const cloudCalls: URL[] = [];

    function cloudDive(overrides: Partial<ImportDive>): ImportDive {
      return {
        computer_no: 674,
        serial: '344FDE85',
        model: 'Perdix AI',
        start: '2026-08-08T07:44:48',
        computer_start: '2026-08-08T07:44:48',
        max_depth_m: 32.1,
        duration_min: 58,
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

    let rich = false;
    let cave = false;

    const candidate = (number: number, time_in: string, minutes_apart: number) => ({
      number,
      date: '2026-08-09',
      time_in,
      site: null,
      max_depth_m: 12,
      minutes_apart,
    });

    /** The parts of 676 cut at the `split` breaks: 1 new, 2 suggests 662, 3 new with a candidate. */
    function caveParts(url: URL): ImportPart[] {
      const at = (url.searchParams.get('split') ?? '')
        .split(',')
        .filter((pair) => pair.startsWith('676@'))
        .map((pair) => Number(pair.slice(4)))
        .sort((a, b) => a - b);
      if (!at.length) return [];
      const ends = { 1740: 2340, 3970: 4090 } as Record<number, number>;
      const starts = [0, ...at.map((s) => ends[s])];
      return starts.map((from, i) => ({
        part: i + 1,
        start: `2026-08-09T${['11:00', '11:39', '12:08'][starts.length === 2 && i ? 1 : i]}:00`,
        duration_min: ((at[i] ?? 4200) - from) / 60,
        max_depth_m: [24.6, 13.2, 6][i],
        status: 'new',
        dive_number: 654 + i,
        candidates:
          i === 1
            ? [candidate(662, '11:40', 1), candidate(663, '15:00', 200)]
            : i === 2
              ? [candidate(663, '15:00', 172)]
              : [],
        suggested: i === 1 ? 662 : null,
      }));
    }

    /**
     * The stub's export: 674 and 673 new, 671 attaches, 670 is logged, 672 is unreadable. With
     * `rich`, 673 has two candidates and a suggestion, 675 may join 674, and 669 is an older new
     * dive the server leaves unticked.
     */
    function exportReport(url: URL): ImportResult {
      const offset = Number(url.searchParams.get('clock_offset_min') ?? 0);
      const shift = (iso: string) => {
        const at = new Date(`${iso}Z`);
        at.setUTCMinutes(at.getUTCMinutes() + offset);
        return at.toISOString().slice(0, 19);
      };
      const at = (computer: string) => ({ computer_start: computer, start: shift(computer) });
      const dives = [
        cloudDive({
          computer_no: 670,
          ...at('2026-08-06T09:00:00'),
          status: 'have',
          dive_number: 640,
        }),
        cloudDive({
          computer_no: 671,
          ...at('2026-08-06T13:00:00'),
          status: 'attach',
          dive_number: 641,
        }),
        cloudDive({
          computer_no: 672,
          ...at('2026-08-07T09:00:00'),
          status: 'error',
          dive_number: null,
          error: 'unreadable log',
        }),
        cloudDive({ computer_no: 673, ...at('2026-08-07T14:00:00'), dive_number: 651 }),
        cloudDive({ computer_no: 674, ...at('2026-08-08T07:44:48'), dive_number: 652 }),
      ];
      if (rich) {
        dives.unshift(
          cloudDive({
            computer_no: 669,
            ...at('2026-08-05T10:00:00'),
            dive_number: 650,
            selected: false,
          }),
        );
        dives[4] = {
          ...dives[4],
          candidates: [
            {
              number: 660,
              date: '2026-08-07',
              time_in: '14:05',
              site: 'Slijk-Ewijk',
              max_depth_m: 9,
              minutes_apart: 5,
            },
            {
              number: 661,
              date: '2026-08-07',
              time_in: '09:00',
              site: null,
              max_depth_m: 4,
              minutes_apart: 300,
            },
          ],
          suggested: 660,
        };
        dives.push(
          cloudDive({
            computer_no: 675,
            ...at('2026-08-08T08:50:00'),
            max_depth_m: 6,
            duration_min: 10,
            dive_number: 653,
            surface_before_min: 8,
          }),
        );
      }
      if (cave)
        dives.push(
          cloudDive({
            computer_no: 676,
            ...at('2026-08-09T11:00:00'),
            max_depth_m: 24.6,
            duration_min: 70,
            dive_number: 654,
            candidates: [candidate(662, '11:40', 40), candidate(663, '15:00', 240)],
            suggested: 662,
            breaks: [
              {
                start_s: 1740,
                end_s: 2340,
                minutes: 10,
                start: '11:29',
                end: '11:39',
                suggested: true,
              },
              {
                start_s: 3970,
                end_s: 4090,
                minutes: 2,
                start: '12:06',
                end: '12:08',
                suggested: false,
              },
            ],
            parts: caveParts(url),
          }),
          cloudDive({
            computer_no: 677,
            ...at('2026-08-09T13:00:00'),
            max_depth_m: 8,
            duration_min: 30,
            dive_number: 657,
            surface_before_min: 50,
          }),
        );
      const dry = url.searchParams.get('dry_run') === 'true';
      const only = url.searchParams.get('only')?.split(',').map(Number);
      const picked = (n: number) => !only || only.includes(n);
      return report({
        dry_run: dry,
        import_id: dry ? '' : 'cloud1',
        created: dives
          .filter((d) => d.status === 'new' && picked(d.computer_no))
          .map((d) => d.dive_number!),
        updated: dives
          .filter((d) => d.status === 'attach' && picked(d.computer_no))
          .map((d) => d.dive_number!),
        skipped: 1,
        dives_in_file: dives.length,
        first_date: '2026-08-06',
        last_date: '2026-08-08',
        dives,
      });
    }

    function stubCloud(
      answer: (url: URL) => Response = (url) => new Response(JSON.stringify(exportReport(url))),
    ) {
      rich = false;
      cave = false;
      cloudCalls.length = 0;
      vi.stubGlobal(
        'fetch',
        vi.fn(async (url: string) => {
          const parsed = new URL(url, 'http://test');
          cloudCalls.push(parsed);
          return answer(parsed);
        }),
      );
    }

    async function preview() {
      const { target, app } = render();
      const cloud = fileInput(target, 'Shearwater Cloud export');
      choose(cloud, [
        new File(['SQLite format 3\0'], 'Shearwater Cloud (sam@example.com) 2026-10-21.db'),
      ]);
      await settle();
      return { target, app };
    }

    const importButton = (target: HTMLElement) =>
      [...target.querySelectorAll<HTMLButtonElement>('.preview button')].find(
        (b) => b.textContent === 'Import',
      )!;
    const offsetInput = (target: HTMLElement) =>
      target.querySelector<HTMLInputElement>('.preview input[type=text]')!;
    const query = (url: URL) => Object.fromEntries(url.searchParams);

    function typeOffset(input: HTMLInputElement, text: string) {
      input.value = text;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      flushSync();
    }

    it('previews the dives with checkboxes and counts the logged ones', async () => {
      stubCloud();
      const { target, app } = await preview();
      expect(cloudCalls[0].pathname).toBe('/api/v1/admin/import/shearwater-cloud');
      expect(query(cloudCalls[0])).toEqual({ dry_run: 'true' });
      const section = target.querySelector<HTMLElement>('.preview')!;
      expect(document.activeElement).toBe(section);
      expect(section.textContent).toContain('5 dives in the export from 2026-08-06 to 2026-08-08');
      expect(section.textContent).toContain('1 dive already in the log');
      expect(section.textContent).toContain('3 of 3 dives selected');
      const fieldset = section.querySelector('fieldset')!;
      expect(fieldset.querySelector('legend')?.textContent).toBe('Dives to import');
      const boxes = [...fieldset.querySelectorAll<HTMLInputElement>('input[type=checkbox]')];
      expect(boxes.map((b) => b.closest('label')!.querySelector('strong')!.textContent)).toEqual([
        'Perdix AI #674',
        'Perdix AI #673',
        'Perdix AI #671',
      ]);
      expect(boxes.every((b) => b.checked)).toBe(true);
      expect(boxes[2].closest('label')!.textContent).toContain('add profile to dive #641');
      expect(section.textContent).toContain("can't be read: unreadable log");
      expect(section.textContent).not.toContain('#670');
      const offset = offsetInput(target);
      const hint = document.getElementById(offset.getAttribute('aria-describedby')!);
      expect(hint?.textContent).toContain('+7 h if the computer was on trip time');
      expect(importButton(target).disabled).toBe(false);
      unmount(app);
    });

    it('imports only the ticked dives, then shows the result', async () => {
      stubCloud();
      const { target, app } = await preview();
      const boxes = target.querySelectorAll<HTMLInputElement>('.preview input[type=checkbox]');
      boxes[1].click();
      flushSync();
      expect(target.querySelector('.preview')!.textContent).toContain('2 of 3 dives selected');
      importButton(target).click();
      await settle();
      expect(query(cloudCalls[1])).toEqual({ only: '671,674' });
      expect(target.querySelector('.preview')).toBeNull();
      const done = target.querySelector('.done')!;
      expect(done.textContent).toContain('1 new draft created');
      expect([...done.querySelectorAll('.created a')].map((a) => a.getAttribute('href'))).toEqual([
        '/admin/dives/652',
      ]);
      expect(done.querySelector('a[href="/admin/dives?status=draft"]')).not.toBeNull();
      expect(invalidateAll).toHaveBeenCalledOnce();
      unmount(app);
    });

    it('sends no selection when every dive stays ticked, and nothing when none is', async () => {
      stubCloud();
      const { target, app } = await preview();
      const boxes = [...target.querySelectorAll<HTMLInputElement>('.preview input[type=checkbox]')];
      for (const box of boxes) box.click();
      flushSync();
      expect(importButton(target).disabled).toBe(true);
      boxes[0].click();
      flushSync();
      for (const box of boxes.slice(1)) box.click();
      flushSync();
      importButton(target).click();
      await settle();
      expect(query(cloudCalls[1])).toEqual({});
      unmount(app);
    });

    it('re-runs the dry run with the clock offset on Enter and imports with it', async () => {
      stubCloud();
      const { target, app } = await preview();
      target.querySelectorAll<HTMLInputElement>('.preview input[type=checkbox]')[1].click();
      flushSync();
      const offset = offsetInput(target);
      offset.focus();
      typeOffset(offset, '+7 h');
      expect(importButton(target).disabled).toBe(true);
      offset.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      await settle();
      expect(query(cloudCalls[1])).toEqual({ dry_run: 'true', clock_offset_min: '420' });
      expect(cloudCalls).toHaveLength(2);
      expect(document.activeElement).toBe(offset);
      const section = target.querySelector('.preview')!;
      expect(section.textContent).toContain('8 Aug 2026 14:44 (computer 07:44)');
      const boxes = [...section.querySelectorAll<HTMLInputElement>('input[type=checkbox]')];
      expect(boxes.map((b) => b.checked)).toEqual([true, false, true]);
      expect(importButton(target).disabled).toBe(false);
      importButton(target).click();
      await settle();
      expect(query(cloudCalls[2])).toEqual({ only: '671,674', clock_offset_min: '420' });
      unmount(app);
    });

    it('re-runs the dry run half a second after typing, once, and on blur', async () => {
      stubCloud();
      const { target, app } = await preview();
      const offset = offsetInput(target);
      typeOffset(offset, '-3');
      typeOffset(offset, '-30 min');
      await new Promise((r) => setTimeout(r, 150));
      expect(cloudCalls).toHaveLength(1);
      await new Promise((r) => setTimeout(r, 450));
      await settle();
      expect(cloudCalls).toHaveLength(2);
      expect(query(cloudCalls[1])).toEqual({ dry_run: 'true', clock_offset_min: '-30' });
      typeOffset(offset, '1:30');
      offset.dispatchEvent(new FocusEvent('blur'));
      await settle();
      expect(query(cloudCalls[2])).toEqual({ dry_run: 'true', clock_offset_min: '90' });
      offset.dispatchEvent(new FocusEvent('blur'));
      await settle();
      expect(cloudCalls).toHaveLength(3);
      unmount(app);
    });

    it('explains an offset it cannot read and keeps Import off', async () => {
      stubCloud();
      const { target, app } = await preview();
      const offset = offsetInput(target);
      typeOffset(offset, 'two days');
      offset.dispatchEvent(new FocusEvent('blur'));
      await settle();
      expect(cloudCalls).toHaveLength(1);
      expect(offset.getAttribute('aria-invalid')).toBe('true');
      expect(target.querySelector('.preview')!.textContent).toContain('+7 h, -30 min or +1:30');
      expect(importButton(target).disabled).toBe(true);
      typeOffset(offset, '');
      offset.dispatchEvent(new FocusEvent('blur'));
      await settle();
      expect(offset.getAttribute('aria-invalid')).toBeNull();
      expect(importButton(target).disabled).toBe(false);
      unmount(app);
    });

    it('says when there is nothing new to import', async () => {
      stubCloud(
        (url) =>
          new Response(
            JSON.stringify(
              report({
                created: [],
                updated: [],
                skipped: 2,
                dives: exportReport(url).dives.filter((d) => d.status === 'have'),
              }),
            ),
          ),
      );
      const { target, app } = await preview();
      const section = target.querySelector('.preview')!;
      expect(section.querySelector('.empty')?.textContent).toBe('Nothing new to import.');
      expect(section.querySelector('fieldset')).toBeNull();
      expect(section.textContent).toContain('1 dive already in the log');
      expect(importButton(target).disabled).toBe(true);
      unmount(app);
    });

    it('shows why an export cannot be read', async () => {
      stubCloud(
        () =>
          new Response(
            JSON.stringify({ detail: 'Could not read export: not a ZIP or SQLite file' }),
            {
              status: 400,
            },
          ),
      );
      const { target, app } = await preview();
      expect(target.querySelector('[role=alert]')?.textContent).toBe(
        'Could not read export: not a ZIP or SQLite file',
      );
      expect(target.querySelector('.preview')).toBeNull();
      unmount(app);
    });

    it('names an export that is too large', async () => {
      stubCloud(() => new Response('', { status: 413, statusText: 'Payload Too Large' }));
      const { target, app } = await preview();
      expect(target.querySelector('[role=alert]')?.textContent).toBe(
        'The export is too large to upload.',
      );
      unmount(app);
    });

    it('keeps the preview when a re-run fails, and can cancel', async () => {
      let fail = false;
      stubCloud((url) =>
        fail
          ? new Response(
              JSON.stringify({ detail: [{ loc: ['query', 'clock_offset_min'], msg: 'too far' }] }),
              {
                status: 422,
              },
            )
          : new Response(JSON.stringify(exportReport(url))),
      );
      const { target, app } = await preview();
      fail = true;
      const offset = offsetInput(target);
      typeOffset(offset, '+2 h');
      offset.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      await settle();
      expect(target.querySelector('[role=alert]')?.textContent).toBe('clock_offset_min: too far');
      expect(target.querySelector('.preview')).not.toBeNull();
      const cancel = [...target.querySelectorAll('button')].find(
        (b) => b.textContent === 'Cancel',
      )!;
      cancel.click();
      flushSync();
      expect(target.querySelector('.preview')).toBeNull();
      unmount(app);
    });

    it('shows why the import failed', async () => {
      stubCloud((url) =>
        url.searchParams.get('dry_run')
          ? new Response(JSON.stringify(exportReport(url)))
          : new Response('', { status: 413 }),
      );
      const { target, app } = await preview();
      importButton(target).click();
      await settle();
      expect(target.querySelector('[role=alert]')?.textContent).toBe(
        'The export is too large to upload.',
      );
      expect(target.querySelector('.preview')).not.toBeNull();
      unmount(app);
    });

    const belongsTo = (target: HTMLElement, n: number) => {
      const title = [...target.querySelectorAll('.preview strong')].find((s) =>
        s.textContent?.startsWith(`Perdix AI #${n}`),
      )!;
      return title.closest('li')!.querySelector<HTMLSelectElement>('select');
    };

    function pick(select: HTMLSelectElement, value: string) {
      select.value = value;
      select.dispatchEvent(new Event('change', { bubbles: true }));
      flushSync();
    }

    it('ticks what the server selected and keeps the older dives collapsed and unticked', async () => {
      stubCloud();
      rich = true;
      const { target, app } = await preview();
      const section = target.querySelector<HTMLElement>('.preview')!;
      expect(section.textContent).toContain('4 of 5 dives selected');
      const current = section.querySelector('fieldset')!;
      const boxes = [...current.querySelectorAll<HTMLInputElement>('input[type=checkbox]')];
      expect(boxes.map((b) => b.checked)).toEqual([true, true, true, true]);
      const older = section.querySelector<HTMLDetailsElement>('details')!;
      expect(older.open).toBe(false);
      expect(older.querySelector('summary')!.textContent).toMatch(
        /Older dives not in your log\s*1/,
      );
      const old = older.querySelector<HTMLInputElement>('input[type=checkbox]')!;
      expect(old.closest('label')!.textContent).toContain('Perdix AI #669');
      expect(old.checked).toBe(false);
      old.click();
      flushSync();
      expect(section.textContent).toContain('5 of 5 dives selected');
      unmount(app);
    });

    it('pre-fills Belongs to with the suggestion and links it on import', async () => {
      stubCloud();
      rich = true;
      const { target, app } = await preview();
      const select = belongsTo(target, 673)!;
      const label = document.querySelector(`label[for="${select.id}"]`);
      expect(label?.textContent).toContain('Belongs to');
      expect(select.getAttribute('aria-describedby')).toContain('dl-cloud-344FDE85-673');
      expect([...select.options].map((o) => o.textContent)).toEqual([
        'New draft',
        'Dive #660 · 14:05 · Slijk-Ewijk · 5 min apart',
        'Dive #661 · 09:00 · 300 min apart',
      ]);
      expect(select.value).toBe('660');
      expect(select.closest('li')!.textContent).toContain('add profile to dive #660');
      expect(belongsTo(target, 671)).toBeNull();
      importButton(target).click();
      await settle();
      expect(query(cloudCalls[1])).toEqual({ only: '671,673,674,675', link: '673:660' });
      unmount(app);
    });

    it('drops a row set to New draft from the links', async () => {
      stubCloud();
      rich = true;
      const { target, app } = await preview();
      pick(belongsTo(target, 673)!, 'own');
      expect(belongsTo(target, 673)!.closest('li')!.textContent).toContain('new draft #651');
      importButton(target).click();
      await settle();
      expect(query(cloudCalls[1])).toEqual({ only: '671,673,674,675' });
      unmount(app);
    });

    it('keeps the choices across a clock offset re-run', async () => {
      stubCloud();
      rich = true;
      const { target, app } = await preview();
      pick(belongsTo(target, 673)!, '661');
      const offset = offsetInput(target);
      typeOffset(offset, '+7 h');
      offset.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      await settle();
      expect(query(cloudCalls[1])).toEqual({ dry_run: 'true', clock_offset_min: '420' });
      expect(belongsTo(target, 673)!.value).toBe('661');
      importButton(target).click();
      await settle();
      expect(query(cloudCalls[2])).toEqual({
        only: '671,673,674,675',
        link: '673:661',
        clock_offset_min: '420',
      });
      unmount(app);
    });

    it('joins a dive to the one before it and imports them as one', async () => {
      stubCloud();
      rich = true;
      const { target, app } = await preview();
      const select = belongsTo(target, 675)!;
      expect([...select.options].map((o) => o.textContent)).toEqual([
        'New draft',
        'Same dive as #674 (surfaced 8 min)',
      ]);
      target.querySelector<HTMLInputElement>('.preview input[type=checkbox]')!.click();
      flushSync();
      pick(select, 'join');
      const section = target.querySelector<HTMLElement>('.preview')!;
      const joined = belongsTo(target, 675)!.closest('li')!;
      expect(joined.querySelector('input[type=checkbox]')).toBeNull();
      expect(joined.textContent).toContain('same dive as #674');
      const first = [...section.querySelectorAll('strong')].find(
        (s) => s.textContent === 'Perdix AI #674 + #675, one dive',
      )!;
      const box = first.closest('label')!.querySelector<HTMLInputElement>('input')!;
      expect(box.checked).toBe(true);
      expect(first.closest('label')!.textContent).toContain('32.1 m, 68 min');
      expect(section.textContent).toContain('3 of 4 dives selected');
      importButton(target).click();
      await settle();
      expect(query(cloudCalls[1])).toEqual({
        only: '671,673,674,675',
        link: '673:660',
        join: '674+675',
      });
      unmount(app);
    });

    describe('a dive with a surface break', () => {
      const spoken: string[] = [];

      beforeEach(() => {
        spoken.length = 0;
        resetAnnouncer();
        registerLiveRegion((a) => spoken.push(a.text));
      });

      afterEach(() => resetAnnouncer());

      async function cavePreview() {
        stubCloud();
        cave = true;
        const opened = await preview();
        await settle();
        return opened;
      }

      const item = (target: HTMLElement, n: number) =>
        [...target.querySelectorAll('.preview strong')]
          .find((s) => s.textContent?.startsWith(`Perdix AI #${n}`))!
          .closest('li')!;
      const splitBoxes = (target: HTMLElement) => [
        ...item(target, 676).querySelectorAll<HTMLInputElement>('.split input[type=checkbox]'),
      ];
      const parts = (target: HTMLElement) => [
        ...item(target, 676).querySelectorAll<HTMLLIElement>('.parts > li'),
      ];

      it('splits it at the suggested break right after the preview and links a part', async () => {
        const { target, app } = await cavePreview();
        expect(cloudCalls.map(query)).toEqual([
          { dry_run: 'true' },
          { dry_run: 'true', split: '676@1740' },
        ]);
        expect(spoken).toHaveLength(1);
        expect(spoken[0]).toMatch(/^Preview ready: .*Perdix AI #676 split into 2 dives$/);
        const row = item(target, 676);
        const fieldset = row.querySelector<HTMLFieldSetElement>('fieldset.split')!;
        expect(fieldset.querySelector('legend')?.textContent).toBe('Split this dive at');
        expect(fieldset.getAttribute('aria-describedby')).toBe('dl-cloud-344FDE85-676');
        expect(
          splitBoxes(target).map((b) => [b.closest('label')!.textContent!.trim(), b.checked]),
        ).toEqual([
          ['29 min · surfaced 10 min (11:29–11:39)', true],
          ['66 min · surfaced 2 min (12:06–12:08)', false],
        ]);
        expect(row.querySelector('label.dive-row')!.textContent).toContain('split into 2 dives');
        expect(belongsTo(target, 676)!.closest('.parts')).not.toBeNull();
        expect(row.querySelector('.parts')!.getAttribute('aria-label')).toBe(
          'Parts of Perdix AI #676',
        );
        const [first, second] = parts(target);
        expect(first.textContent).toContain('Part 1 · 11:00 · 29 min · 24.6 m');
        expect(first.textContent).toContain('new draft #654');
        expect(first.querySelector('select')).toBeNull();
        expect(second.textContent).toContain('Part 2 · 11:39 · 31 min · 13.2 m');
        const select = second.querySelector('select')!;
        expect(document.querySelector(`label[for="${select.id}"]`)?.textContent).toContain(
          'Belongs to',
        );
        expect(select.getAttribute('aria-describedby')).toBe('dl-cloud-344FDE85-676-part-2');
        expect([...select.options].map((o) => o.textContent)).toEqual([
          'New draft',
          'Dive #662 · 11:40 · 1 min apart',
          'Dive #663 · 15:00 · 200 min apart',
        ]);
        expect(select.value).toBe('662');
        expect(second.textContent).toContain('add profile to dive #662');
        expect(belongsTo(target, 677)).toBeNull();
        expect(target.querySelector('.preview')!.textContent).toContain('6 of 6 dives selected');
        pick(select, '663');
        expect(second.textContent).toContain('add profile to dive #663');
        importButton(target).click();
        await settle();
        expect(query(cloudCalls[2])).toEqual({ link: '676.2:663', split: '676@1740' });
        unmount(app);
      });

      it('re-runs the dry run after a pause when a break is ticked, holding Import till then', async () => {
        const { target, app } = await cavePreview();
        splitBoxes(target)[1].click();
        flushSync();
        expect(importButton(target).disabled).toBe(true);
        expect(parts(target)).toHaveLength(0);
        expect(item(target, 676).textContent).toContain('split into 3 dives');
        await new Promise((r) => setTimeout(r, 100));
        expect(cloudCalls).toHaveLength(2);
        await new Promise((r) => setTimeout(r, 400));
        await settle();
        expect(query(cloudCalls[2])).toEqual({ dry_run: 'true', split: '676@1740,676@3970' });
        expect(parts(target).map((p) => p.querySelector('strong')!.textContent)).toEqual([
          'Part 1 · 11:00 · 29 min · 24.6 m',
          'Part 2 · 11:39 · 27.2 min · 13.2 m',
          'Part 3 · 12:08 · 1.8 min · 6 m',
        ]);
        expect(spoken.at(-1)).toMatch(/^Split applied: .*Perdix AI #676 split into 3 dives$/);
        expect(importButton(target).disabled).toBe(false);
        for (const box of splitBoxes(target)) box.click();
        flushSync();
        await new Promise((r) => setTimeout(r, 450));
        await settle();
        expect(query(cloudCalls[3])).toEqual({ dry_run: 'true' });
        expect(parts(target)).toHaveLength(0);
        expect(splitBoxes(target).map((b) => b.checked)).toEqual([false, false]);
        expect(belongsTo(target, 676)!.value).toBe('662');
        importButton(target).click();
        await settle();
        expect(query(cloudCalls[4])).toEqual({ link: '676:662' });
        unmount(app);
      });

      it('keeps the splits and the part choices across a clock offset re-run', async () => {
        const { target, app } = await cavePreview();
        pick(parts(target)[1].querySelector('select')!, 'own');
        const offset = offsetInput(target);
        typeOffset(offset, '+1 h');
        offset.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
        await settle();
        expect(query(cloudCalls[2])).toEqual({
          dry_run: 'true',
          split: '676@1740',
          clock_offset_min: '60',
        });
        expect(cloudCalls).toHaveLength(3);
        expect(parts(target)[1].querySelector('select')!.value).toBe('own');
        expect(spoken.at(-1)).toMatch(/^Clock offset applied: /);
        importButton(target).click();
        await settle();
        expect(query(cloudCalls[3])).toEqual({ split: '676@1740', clock_offset_min: '60' });
        unmount(app);
      });

      it('joins the next dive only once the break is unticked, and then hides Split', async () => {
        const { target, app } = await cavePreview();
        splitBoxes(target)[0].click();
        flushSync();
        expect([...belongsTo(target, 677)!.options].map((o) => o.textContent)).toEqual([
          'New draft',
          'Same dive as #676 (surfaced 50 min)',
        ]);
        pick(belongsTo(target, 677)!, 'join');
        expect(item(target, 676).querySelector('fieldset.split')).toBeNull();
        expect(item(target, 677).querySelector('fieldset.split')).toBeNull();
        await new Promise((r) => setTimeout(r, 450));
        await settle();
        expect(query(cloudCalls[2])).toEqual({ dry_run: 'true' });
        expect(target.querySelector('.preview')!.textContent).toContain(
          'Perdix AI #676 + #677, one dive',
        );
        importButton(target).click();
        await settle();
        expect(query(cloudCalls[3])).toEqual({ link: '676:662', join: '676+677' });
        unmount(app);
      });

      it('keeps the preview when a split re-run fails', async () => {
        let fail = false;
        stubCloud((url) =>
          fail
            ? new Response(
                JSON.stringify({ detail: 'Cannot split #676: no surface break at 66 min' }),
                {
                  status: 400,
                },
              )
            : new Response(JSON.stringify(exportReport(url))),
        );
        cave = true;
        const { target, app } = await preview();
        await settle();
        fail = true;
        splitBoxes(target)[1].click();
        flushSync();
        await new Promise((r) => setTimeout(r, 450));
        await settle();
        expect(target.querySelector('[role=alert]')?.textContent).toBe(
          'Cannot split #676: no surface break at 66 min',
        );
        expect(parts(target)).toHaveLength(0);
        expect(importButton(target).disabled).toBe(true);
        unmount(app);
      });
    });

    it('focuses the export input when the page opens at #shearwater-cloud', () => {
      const scroll = vi.fn();
      Element.prototype.scrollIntoView = scroll;
      location.hash = '#shearwater-cloud';
      try {
        const { target, app } = render();
        const input = fileInput(target, 'Shearwater Cloud export');
        expect(document.activeElement).toBe(input);
        expect(input.closest('#shearwater-cloud')).not.toBeNull();
        expect(scroll).toHaveBeenCalledWith({ block: 'start' });
        unmount(app);
      } finally {
        location.hash = '';
        delete (Element.prototype as Partial<Element>).scrollIntoView;
      }
    });

    it('leaves the focus alone without the hash', () => {
      const { target, app } = render();
      expect(document.activeElement).not.toBe(fileInput(target, 'Shearwater Cloud export'));
      unmount(app);
    });
  });
});
