import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, tick, unmount } from 'svelte';

vi.mock('$app/navigation', () => ({ invalidateAll: vi.fn(async () => {}) }));

import { invalidateAll } from '$app/navigation';
import AdminImportPage from './AdminImportPage.svelte';
import type { ImportResult } from '$lib/core/dive/types.js';

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

const xml = (name: string) => new File(['<dive/>'], name, { type: 'text/xml' });

describe('AdminImportPage', () => {
  it('previews a dry run, then imports the same files and links the drafts', async () => {
    const { target, app } = render();
    const [perdix] = target.querySelectorAll<HTMLInputElement>('input[type=file]');
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
    const [, subsurface] = target.querySelectorAll<HTMLInputElement>('input[type=file]');
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
    choose(target.querySelector<HTMLInputElement>('input[type=file]')!, [xml('x.xml')]);
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
});
