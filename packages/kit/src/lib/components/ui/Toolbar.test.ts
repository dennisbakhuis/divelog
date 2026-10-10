import { describe, expect, it, vi } from 'vitest';
import { flushSync } from 'svelte';
import ToolbarProbe from './__fixtures__/ToolbarProbe.svelte';
import { key, render, settle } from './__fixtures__/test-utils.js';

function buttons(target: HTMLElement) {
  return [...target.querySelectorAll<HTMLButtonElement>('button')];
}

describe('Toolbar', () => {
  it('is a radio group with one tab stop, hints, shortcuts and caller classes', () => {
    const { target, destroy } = render(ToolbarProbe, {});
    const group = target.querySelector('[role="radiogroup"]')!;
    expect(group.getAttribute('aria-label')).toBe('Tool');
    const [add, survey, connect] = buttons(target);
    expect(add.getAttribute('role')).toBe('radio');
    expect(add.getAttribute('aria-checked')).toBe('true');
    expect(connect.getAttribute('aria-checked')).toBe('false');
    expect(buttons(target).map((b) => b.tabIndex)).toEqual([0, -1, -1, -1]);
    expect(survey.disabled).toBe(true);
    expect(add.getAttribute('aria-keyshortcuts')).toBe('A');
    expect(add.querySelector('kbd')?.textContent).toBe('A');
    expect(document.getElementById(add.getAttribute('aria-describedby')!)?.textContent).toBe(
      'Click to add a station',
    );
    expect(add.className).toContain('dl-btn-solid');
    expect(connect.className).toContain('dl-btn-ghost');
    destroy();
  });

  it('selects and focuses with arrows, Home and End, skipping disabled tools', async () => {
    const onchange = vi.fn();
    const { target, destroy } = render(ToolbarProbe, { onchange });
    const [add, , connect, move] = buttons(target);
    add.focus();
    key(add, 'ArrowRight');
    await settle();
    expect(document.activeElement).toBe(connect);
    expect(connect.getAttribute('aria-checked')).toBe('true');
    expect(connect.tabIndex).toBe(0);
    key(connect, 'ArrowDown');
    await settle();
    expect(document.activeElement).toBe(move);
    key(move, 'ArrowRight');
    await settle();
    expect(document.activeElement).toBe(add);
    key(add, 'ArrowLeft');
    await settle();
    expect(document.activeElement).toBe(move);
    key(move, 'Home');
    await settle();
    expect(document.activeElement).toBe(add);
    key(add, 'End');
    await settle();
    expect(document.activeElement).toBe(move);
    expect(key(move, 'x').defaultPrevented).toBe(false);
    expect(onchange.mock.calls.map(([v]) => v)).toEqual([
      'connect',
      'move',
      'add',
      'move',
      'add',
      'move',
    ]);
    connect.click();
    flushSync();
    expect(onchange).toHaveBeenLastCalledWith('connect');
    destroy();
  });

  it('as a toolbar of pressed buttons, arrows move focus only', async () => {
    const onchange = vi.fn();
    const { target, destroy } = render(ToolbarProbe, {
      mode: 'pressed',
      orientation: 'vertical',
      onchange,
    });
    const bar = target.querySelector('[role="toolbar"]')!;
    expect(bar.getAttribute('aria-orientation')).toBe('vertical');
    const [add, , connect] = buttons(target);
    expect(add.getAttribute('aria-pressed')).toBe('true');
    expect(add.hasAttribute('role')).toBe(false);
    add.focus();
    expect(key(add, 'ArrowRight').defaultPrevented).toBe(false);
    key(add, 'ArrowDown');
    await settle();
    expect(document.activeElement).toBe(connect);
    expect(add.getAttribute('aria-pressed')).toBe('true');
    expect(onchange).not.toHaveBeenCalled();
    key(connect, 'ArrowUp');
    await settle();
    expect(document.activeElement).toBe(add);
    destroy();
  });
});
