import { describe, expect, it } from 'vitest';
import { flushSync } from 'svelte';
import PopoverProbe from './__fixtures__/PopoverProbe.svelte';
import { key, render, settle } from './__fixtures__/test-utils.js';

describe('Popover', () => {
  it('wires the trigger, focuses the panel and returns focus on Escape', async () => {
    const { target, destroy } = render(PopoverProbe, {});
    const trigger = target.querySelector<HTMLButtonElement>('.trigger')!;
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    expect(trigger.getAttribute('aria-haspopup')).toBe('dialog');
    const controls = trigger.getAttribute('aria-controls')!;
    expect(document.getElementById(controls)).toBeNull();

    trigger.focus();
    trigger.click();
    await settle();
    const panel = document.getElementById(controls)!;
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    expect(panel.getAttribute('role')).toBe('dialog');
    expect(panel.getAttribute('aria-label')).toBe('Repo notices');
    expect(document.activeElement).toBe(panel);

    key(panel, 'Escape');
    expect(document.getElementById(controls)).toBeNull();
    expect(document.activeElement).toBe(trigger);
    destroy();
  });

  it('closes on a click outside without moving focus, and toggles from the trigger', async () => {
    const { target, destroy } = render(PopoverProbe, { open: true, focus: 'first' });
    await settle();
    expect(document.activeElement).toBe(target.querySelector('.link'));

    target
      .querySelector('.link')!
      .dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    flushSync();
    expect(target.querySelector('.dl-popover')).not.toBeNull();

    const outside = target.querySelector<HTMLButtonElement>('.outside')!;
    outside.focus();
    outside.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    flushSync();
    expect(target.querySelector('.dl-popover')).toBeNull();
    expect(document.activeElement).toBe(outside);

    const trigger = target.querySelector<HTMLButtonElement>('.trigger')!;
    trigger.click();
    flushSync();
    expect(target.querySelector('.dl-popover')).not.toBeNull();
    trigger.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    trigger.click();
    flushSync();
    expect(target.querySelector('.dl-popover')).toBeNull();
    destroy();
  });

  it('closes from inside through the close callback', async () => {
    const { target, destroy } = render(PopoverProbe, { open: true, focus: 'none' });
    await settle();
    expect(document.activeElement).toBe(document.body);
    target.querySelector<HTMLButtonElement>('.close')!.click();
    flushSync();
    expect(target.querySelector('.dl-popover')).toBeNull();
    expect(document.activeElement).toBe(target.querySelector('.trigger'));
    destroy();
  });
});
