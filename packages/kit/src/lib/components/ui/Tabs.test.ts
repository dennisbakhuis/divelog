import { afterEach, describe, expect, it, vi } from 'vitest';
import { flushSync } from 'svelte';
import TabsProbe from './__fixtures__/TabsProbe.svelte';
import { key, render, settle } from './__fixtures__/test-utils.js';

afterEach(() => history.replaceState(null, '', '/'));

function tabs(target: HTMLElement) {
  return [...target.querySelectorAll<HTMLButtonElement>('[role="tab"]')];
}

describe('Tabs', () => {
  it('links tabs and panels and keeps one tab in the tab order', () => {
    const { target, destroy } = render(TabsProbe, {});
    const list = target.querySelector('[role="tablist"]')!;
    expect(list.getAttribute('aria-label')).toBe('Notes');
    const [story, original, off] = tabs(target);
    expect(story.getAttribute('aria-selected')).toBe('true');
    expect(story.tabIndex).toBe(0);
    expect(original.tabIndex).toBe(-1);
    expect(off.disabled).toBe(true);
    const panel = document.getElementById(story.getAttribute('aria-controls')!)!;
    expect(panel.getAttribute('role')).toBe('tabpanel');
    expect(panel.getAttribute('aria-labelledby')).toBe(story.id);
    expect(panel.hidden).toBe(false);
    expect(panel.textContent).toBe('Panel story');
    const other = document.getElementById(original.getAttribute('aria-controls')!)!;
    expect(other.hidden).toBe(true);
    expect(other.textContent).toBe('');
    destroy();
  });

  it('moves with arrows, Home and End, skipping disabled tabs and wrapping', async () => {
    const onchange = vi.fn();
    const { target, destroy } = render(TabsProbe, { onchange });
    const [story, original, , logbook] = tabs(target);
    story.focus();

    key(story, 'ArrowRight');
    await settle();
    expect(original.getAttribute('aria-selected')).toBe('true');
    expect(document.activeElement).toBe(original);

    key(original, 'ArrowRight');
    await settle();
    expect(document.activeElement).toBe(logbook);
    expect(target.querySelector('.content')?.textContent).toBe('Panel logbook');

    key(logbook, 'ArrowRight');
    await settle();
    expect(document.activeElement).toBe(story);

    key(story, 'ArrowLeft');
    await settle();
    expect(document.activeElement).toBe(logbook);

    key(logbook, 'Home');
    await settle();
    expect(document.activeElement).toBe(story);
    key(story, 'End');
    await settle();
    expect(document.activeElement).toBe(logbook);

    const ignored = key(logbook, 'a');
    expect(ignored.defaultPrevented).toBe(false);
    expect(onchange.mock.calls.map(([id]) => id)).toEqual([
      'original',
      'logbook',
      'story',
      'logbook',
      'story',
      'logbook',
    ]);
    destroy();
  });

  it('selects on click and falls back to the first tab for an unknown id', () => {
    const { target, destroy } = render(TabsProbe, { active: 'nope' });
    const [story, original] = tabs(target);
    expect(story.getAttribute('aria-selected')).toBe('true');
    original.click();
    flushSync();
    expect(original.getAttribute('aria-selected')).toBe('true');
    story.click();
    story.click();
    flushSync();
    expect(target.querySelector('.content')?.textContent).toBe('Panel story');
    destroy();
  });

  it('renders only the panel for a single tab', () => {
    const { target, destroy } = render(TabsProbe, { tabs: [{ id: 'story', label: 'Story' }] });
    expect(target.querySelector('[role="tablist"]')).toBeNull();
    expect(target.querySelector('[role="tabpanel"]')).toBeNull();
    expect(target.querySelector('.content')?.textContent).toBe('Panel story');
    destroy();
  });

  it('reads and writes the URL hash when asked', async () => {
    history.replaceState(null, '', '/dive/650#logbook');
    const { target, destroy } = render(TabsProbe, { hash: true });
    await settle();
    expect(target.querySelector('.content')?.textContent).toBe('Panel logbook');
    tabs(target)[1].click();
    flushSync();
    expect(location.hash).toBe('#original');
    expect(location.pathname).toBe('/dive/650');
    destroy();
  });
});
