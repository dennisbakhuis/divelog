import { describe, expect, it, vi } from 'vitest';
import { flushSync } from 'svelte';
import ComboboxProbe from './__fixtures__/ComboboxProbe.svelte';
import { key, render, settle } from './__fixtures__/test-utils.js';
import type { ComboOption } from '$lib/core/ui/combobox.js';

const SITES: ComboOption[] = [
  { value: 'mex-nohoch', label: 'Nohoch Nah Chich', group: 'Recent', hint: 'Mexico' },
  { value: 'nld-vinkeveen', label: 'Vinkeveen', group: 'Recent', hint: 'Netherlands' },
  { value: 'mex-calavera', label: 'Cénote Calavera', group: 'All', hint: 'Mexico' },
  { value: 'mex-closed', label: 'Closed cave', group: 'All', disabled: true },
  { value: 'egy-thistle', label: 'SS Thistlegorm', group: 'All', keywords: 'wreck red sea' },
];

function parts(target: HTMLElement) {
  const input = target.querySelector<HTMLInputElement>('input[role="combobox"]')!;
  const list = document.getElementById(input.getAttribute('aria-controls')!)!;
  const options = () => [...list.querySelectorAll<HTMLElement>('[role="option"]')];
  const activeText = () =>
    input.getAttribute('aria-activedescendant')
      ? document.getElementById(input.getAttribute('aria-activedescendant')!)?.textContent?.trim()
      : undefined;
  return { input, list, options, activeText };
}

function type(input: HTMLInputElement, text: string) {
  input.value = text;
  input.dispatchEvent(new Event('input', { bubbles: true }));
  flushSync();
}

describe('Combobox', () => {
  it('is labelled, described and required through Field', () => {
    const { target, destroy } = render(ComboboxProbe, {
      options: SITES,
      error: 'Pick a site',
      required: true,
    });
    const { input, list } = parts(target);
    const label = target.querySelector('label')!;
    expect(label.htmlFor).toBe(input.id);
    expect(label.textContent).toContain('Site');
    expect(label.querySelector('.dl-field-req')?.getAttribute('aria-hidden')).toBe('true');
    const [errorId, hintId] = input.getAttribute('aria-describedby')!.split(' ');
    expect(document.getElementById(errorId)?.textContent).toContain('Pick a site');
    expect(document.getElementById(hintId)?.textContent).toBe('Recent sites first');
    expect(input.getAttribute('aria-invalid')).toBe('true');
    expect(input.required).toBe(true);
    expect(input.getAttribute('aria-required')).toBe('true');
    expect(input.getAttribute('aria-expanded')).toBe('false');
    expect(list.getAttribute('role')).toBe('listbox');
    expect(list.closest('[hidden]')).not.toBeNull();
    destroy();
  });

  it('opens with ArrowDown, moves with arrows/Home/End past disabled options and picks with Enter', () => {
    const onchange = vi.fn();
    const { target, destroy } = render(ComboboxProbe, { options: SITES, onchange });
    const { input, list, options, activeText } = parts(target);
    input.focus();
    key(input, 'ArrowDown');
    expect(input.getAttribute('aria-expanded')).toBe('true');
    expect(list.closest('[hidden]')).toBeNull();
    expect(options()).toHaveLength(5);
    expect(activeText()).toContain('Nohoch Nah Chich');

    const groups = [...list.querySelectorAll('[role="group"]')];
    expect(
      groups.map((g) =>
        document.getElementById(g.getAttribute('aria-labelledby')!)?.textContent?.trim(),
      ),
    ).toEqual(['Recent', 'All']);

    key(input, 'ArrowDown');
    key(input, 'ArrowDown');
    expect(activeText()).toContain('Cénote Calavera');
    key(input, 'ArrowDown');
    expect(activeText()).toContain('SS Thistlegorm');
    key(input, 'ArrowDown');
    expect(activeText()).toContain('Nohoch Nah Chich');
    key(input, 'ArrowUp');
    expect(activeText()).toContain('SS Thistlegorm');
    key(input, 'Home');
    expect(activeText()).toContain('Nohoch Nah Chich');
    key(input, 'End');
    expect(activeText()).toContain('SS Thistlegorm');

    const enter = key(input, 'Enter');
    expect(enter.defaultPrevented).toBe(true);
    expect(input.getAttribute('aria-expanded')).toBe('false');
    expect(input.value).toBe('SS Thistlegorm');
    expect(onchange).toHaveBeenLastCalledWith('egy-thistle');
    expect(target.querySelector<HTMLInputElement>('input[type="hidden"]')?.value).toBe(
      'egy-thistle',
    );
    expect(input.required).toBe(false);

    key(input, 'ArrowUp');
    expect(activeText()).toContain('SS Thistlegorm');
    const selected = options().find((o) => o.getAttribute('aria-selected') === 'true');
    expect(selected?.textContent).toContain('SS Thistlegorm');
    destroy();
  });

  it('filters as the owner types, ignoring accents, and matches keywords', () => {
    const { target, destroy } = render(ComboboxProbe, { options: SITES });
    const { input, options, activeText } = parts(target);
    input.focus();
    type(input, 'cenote');
    expect(options().map((o) => o.querySelector('.dl-combobox-label')?.textContent)).toEqual([
      'Cénote Calavera',
    ]);
    expect(activeText()).toContain('Cénote Calavera');
    type(input, 'red sea');
    expect(options().map((o) => o.querySelector('.dl-combobox-label')?.textContent)).toEqual([
      'SS Thistlegorm',
    ]);
    type(input, 'zzz');
    expect(options()).toHaveLength(0);
    expect(target.querySelector('.dl-combobox-status')?.textContent).toBe('No matches');
    const enter = key(input, 'Enter');
    expect(enter.defaultPrevented).toBe(true);
    destroy();
  });

  it('closes on Escape without letting it bubble, then restores the selected label', () => {
    const { target, destroy } = render(ComboboxProbe, { options: SITES, value: 'nld-vinkeveen' });
    const { input } = parts(target);
    expect(input.value).toBe('Vinkeveen');
    const outer = vi.fn();
    window.addEventListener('keydown', outer);
    input.focus();
    type(input, 'Noh');
    const esc = key(input, 'Escape');
    expect(esc.defaultPrevented).toBe(true);
    expect(input.getAttribute('aria-expanded')).toBe('false');
    expect(input.value).toBe('Noh');
    expect(key(input, 'Escape').defaultPrevented).toBe(true);
    expect(input.value).toBe('Vinkeveen');
    key(input, 'Escape');
    expect(outer).toHaveBeenCalledOnce();
    window.removeEventListener('keydown', outer);
    destroy();
  });

  it('picks with the mouse, clears with the clear button and on an emptied blur', async () => {
    const onchange = vi.fn();
    const { target, destroy } = render(ComboboxProbe, { options: SITES, onchange });
    const { input, options } = parts(target);
    input.click();
    flushSync();
    options()[3].click();
    flushSync();
    expect(onchange).not.toHaveBeenCalled();
    const mousedown = new MouseEvent('mousedown', { bubbles: true, cancelable: true });
    options()[1].dispatchEvent(mousedown);
    expect(mousedown.defaultPrevented).toBe(true);
    options()[1].click();
    flushSync();
    expect(input.value).toBe('Vinkeveen');
    expect(onchange).toHaveBeenCalledTimes(1);

    const clear = target.querySelector<HTMLButtonElement>('.dl-combobox-clear')!;
    expect(clear.getAttribute('aria-label')).toBe('Clear');
    clear.click();
    flushSync();
    expect(input.value).toBe('');
    expect(onchange).toHaveBeenLastCalledWith(null);
    expect(target.querySelector('.dl-combobox-clear')).toBeNull();

    input.focus();
    key(input, 'ArrowDown');
    key(input, 'Enter');
    expect(input.value).toBe('Nohoch Nah Chich');
    type(input, '');
    target.querySelector<HTMLButtonElement>('.after')!.focus();
    flushSync();
    expect(onchange).toHaveBeenLastCalledWith(null);

    input.focus();
    key(input, 'ArrowDown');
    key(input, 'Enter');
    type(input, 'garbage');
    target.querySelector<HTMLButtonElement>('.after')!.focus();
    flushSync();
    expect(input.value).toBe('Nohoch Nah Chich');
    await settle();
    destroy();
  });

  it('selects several values as chips and removes them with Backspace or their button', () => {
    const onchange = vi.fn();
    const { target, destroy } = render(ComboboxProbe, {
      options: SITES,
      multiple: true,
      onchange,
    });
    const { input, list, options } = parts(target);
    expect(list.getAttribute('aria-multiselectable')).toBe('true');
    input.focus();
    key(input, 'ArrowDown');
    key(input, 'Enter');
    expect(input.getAttribute('aria-expanded')).toBe('true');
    expect(options()).toHaveLength(4);
    type(input, 'vink');
    key(input, 'Enter');
    expect(onchange).toHaveBeenLastCalledWith(['mex-nohoch', 'nld-vinkeveen']);
    const chips = () =>
      [...target.querySelectorAll('.dl-combobox-chip')].map(
        (c) => c.querySelector('span')?.textContent,
      );
    expect(chips()).toEqual(['Nohoch Nah Chich', 'Vinkeveen']);
    expect(
      [...target.querySelectorAll<HTMLInputElement>('input[type="hidden"]')].map((i) => i.value),
    ).toEqual(['mex-nohoch', 'nld-vinkeveen']);

    key(input, 'Backspace');
    expect(chips()).toEqual(['Nohoch Nah Chich']);
    const remove = target.querySelector<HTMLButtonElement>('.dl-combobox-chip-remove')!;
    expect(remove.getAttribute('aria-label')).toBe('Remove Nohoch Nah Chich');
    remove.click();
    flushSync();
    expect(chips()).toEqual([]);
    expect(document.activeElement).toBe(input);
    destroy();
  });

  it('asks an async source after the debounce, aborts stale queries and labels known values', async () => {
    const calls: string[] = [];
    const aborted: string[] = [];
    const source = vi.fn(async (query: string, signal: AbortSignal) => {
      calls.push(query);
      signal.addEventListener('abort', () => aborted.push(query));
      await new Promise((r) => setTimeout(r, 5));
      return SITES.filter((s) => s.label.toLowerCase().includes(query.toLowerCase())).map((s) => ({
        ...s,
        group: undefined,
      }));
    });
    const onfooter = vi.fn();
    const { target, destroy } = render(ComboboxProbe, {
      source,
      value: 'nld-vinkeveen',
      known: [{ value: 'nld-vinkeveen', label: 'Vinkeveen' }],
      onfooter,
    });
    const { input, options } = parts(target);
    expect(input.value).toBe('Vinkeveen');
    input.focus();
    key(input, 'ArrowDown');
    await vi.waitFor(() => {
      flushSync();
      expect(options()).toHaveLength(5);
    });
    expect(calls).toEqual(['']);

    type(input, 'n');
    type(input, 'noh');
    expect(target.querySelector('.dl-combobox-status')?.textContent).toBe('Searching…');
    await vi.waitFor(() => {
      flushSync();
      expect(options()).toHaveLength(1);
    });
    await settle();
    expect(calls).toEqual(['', 'noh']);
    expect(aborted).toEqual(['']);
    expect(options().map((o) => o.querySelector('.dl-combobox-label')?.textContent)).toEqual([
      'Nohoch Nah Chich',
    ]);

    target.querySelector<HTMLButtonElement>('.new')!.click();
    flushSync();
    expect(onfooter).toHaveBeenCalledWith('noh');
    expect(input.getAttribute('aria-expanded')).toBe('false');
    destroy();
    expect(aborted).toEqual(['', 'noh']);
  });
});
