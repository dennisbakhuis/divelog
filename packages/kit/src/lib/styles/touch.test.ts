import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/*
 * Phone rules that jsdom cannot lay out: 44 px targets and 16 px form text on
 * coarse pointers, the dialog scroll lock, toast placement and the admin nav.
 * Reads the stylesheets and component styles and checks the rules are there.
 */

const lib = join(process.cwd(), 'src/lib');
const read = (path: string) => readFileSync(join(lib, path), 'utf8');

/** Bodies of every `@media <query> { … }` block in a stylesheet, braces matched. */
function mediaBlocks(css: string, query: string): string {
  const bodies: string[] = [];
  let from = 0;
  for (;;) {
    const at = css.indexOf(`@media ${query}`, from);
    if (at === -1) break;
    const open = css.indexOf('{', at);
    let depth = 0;
    let end = open;
    for (; end < css.length; end++) {
      if (css[end] === '{') depth++;
      else if (css[end] === '}' && --depth === 0) break;
    }
    bodies.push(css.slice(open + 1, end));
    from = end;
  }
  return bodies.join('\n');
}

/** The declarations of the first rule whose selector ends in `selector`. */
function rule(css: string, selector: string): string {
  const at = css.indexOf(`${selector} {`);
  if (at === -1) throw new Error(`no rule for ${selector}`);
  return css.slice(at, css.indexOf('}', at));
}

const coarse = (path: string) => mediaBlocks(read(path), '(pointer: coarse)');

describe('phone styles', () => {
  it('defines the 44 px touch target token', () => {
    expect(read('styles/tokens.css')).toMatch(/--dl-tap-min:\s*44px;/);
  });

  it('gives buttons 44 px and form text 16 px on coarse pointers', () => {
    const css = coarse('styles/divelog.css');
    expect(rule(css, '.dl-btn')).toMatch(/min-height:\s*var\(--dl-tap-min\)/);
    expect(css).toMatch(/select,\s*textarea\s*\)\s*\{\s*font-size:\s*max\(16px, 1rem\) !important/);
    expect(css).toMatch(/input:not\([^)]*\[type='checkbox'\]/);
  });

  it('sizes the combobox for touch and keeps its footer in view', () => {
    const css = coarse('components/ui/Combobox.svelte');
    expect(rule(css, '.dl-combobox .dl-combobox-input')).toMatch(/font-size:\s*max\(16px, 1rem\)/);
    expect(rule(css, '.dl-combobox-toggle')).toMatch(/min-height:\s*var\(--dl-tap-min, 44px\)/);
    expect(rule(css, '.dl-combobox-option')).toMatch(/min-height:\s*var\(--dl-tap-min, 44px\)/);
    const footer = rule(read('components/ui/Combobox.svelte'), '.dl-combobox-footer');
    expect(footer).toMatch(/position:\s*sticky/);
    expect(footer).toMatch(/bottom:\s*0/);
  });

  it('locks the page behind a modal dialog and sizes its close button', () => {
    const src = read('components/ui/Dialog.svelte');
    expect(rule(src, '  .dl-dialog')).toMatch(/overscroll-behavior:\s*contain/);
    expect(rule(src, ':global(:root:has(dialog.dl-dialog:modal))')).toMatch(/overflow:\s*hidden/);
    expect(rule(coarse('components/ui/Dialog.svelte'), '.dl-dialog-close')).toMatch(
      /min-height:\s*var\(--dl-tap-min, 44px\)/,
    );
  });

  it('gives toolbar tools and toast close buttons 44 px', () => {
    expect(rule(coarse('components/ui/Toolbar.svelte'), '.dl-tool')).toMatch(/min-height/);
    expect(rule(coarse('components/shell/Toast.svelte'), '.toast-close')).toMatch(/min-height/);
  });

  it('puts toasts under the admin bar on a phone and above a save bar elsewhere', () => {
    const src = read('components/shell/Toast.svelte');
    expect(rule(src, '  .toast-container')).toMatch(/var\(--dl-toast-offset, 0px\)/);
    const narrow = mediaBlocks(src, '(max-width: 699.98px)');
    const container = rule(narrow, '.toast-container');
    expect(container).toMatch(/top:\s*calc\(var\(--dl-admin-bar-h, 0px\)/);
    expect(container).toMatch(/bottom:\s*auto/);
  });

  it('wraps the admin sections instead of clipping them, with 44 px links on touch', () => {
    const src = read('routes/admin/AdminShell.svelte');
    const narrow = mediaBlocks(src, '(max-width: 1199.98px)');
    expect(rule(narrow, '.sections')).toMatch(/flex-wrap:\s*wrap/);
    expect(coarse('routes/admin/AdminShell.svelte')).toMatch(
      /\.sections a,\s*\.muted,\s*\.repo\s*\{\s*min-height:\s*var\(--dl-tap-min, 44px\)/,
    );
  });

  it('gives the signing controls 44 px: the pad tools, the sign box and the dive form checkbox', () => {
    expect(
      rule(coarse('components/ui/SignaturePad.svelte'), '.dl-signature-tools .dl-btn'),
    ).toMatch(/min-height:\s*var\(--dl-tap-min, 44px\)/);
    const box = read('components/dive/SignBox.svelte');
    expect(rule(box, '  .check')).toMatch(/min-height:\s*44px/);
    expect(rule(box, '  .sign')).toMatch(/min-height:\s*44px/);
    expect(rule(box, '  textarea')).toMatch(/min-height:\s*44px/);
    expect(coarse('components/admin/BuddyNotesPanel.svelte')).toMatch(
      /\.check,\s*\.actions \.dl-btn\s*\{\s*min-height:\s*var\(--dl-tap-min, 44px\)/,
    );
    expect(rule(coarse('components/admin/DiveForm.svelte'), '.save-bar .ask')).toMatch(
      /min-height:\s*var\(--dl-tap-min, 44px\)/,
    );
  });
});
