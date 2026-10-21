import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, tick, unmount } from 'svelte';

vi.mock('$app/navigation', () => ({ invalidateAll: vi.fn(async () => {}) }));

import { invalidateAll } from '$app/navigation';
import AdminImportPage from './AdminImportPage.svelte';
import { CLOUD_EXPORT_HELP } from '$lib/core/admin/cloud-import.js';
import type { ImportDive, ImportResult } from '$lib/core/dive/types.js';

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
        ...overrides,
      };
    }

    /** The stub's export: 674 and 673 new, 671 attaches, 670 is logged, 672 is unreadable. */
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
      expect(boxes[2].closest('label')!.textContent).toContain('profile for #641');
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
  });
});
