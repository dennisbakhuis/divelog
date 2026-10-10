import { afterEach, describe, expect, it } from 'vitest';
import { flushSync } from 'svelte';
import LayoutProbe from './__fixtures__/LayoutProbe.svelte';
import { render } from './__fixtures__/test-utils.js';
import { announce } from '$lib/core/ui/announce.js';

afterEach(() => (document.body.innerHTML = ''));

describe('DivelogProvider shell', () => {
  it('renders the skip link first, which moves focus to #dl-main', () => {
    const { target, destroy } = render(LayoutProbe, {});
    const root = target.querySelector('.divelog')!;
    const link = root.firstElementChild as HTMLAnchorElement;
    expect(link.classList.contains('dl-skip-link')).toBe(true);
    expect(link.getAttribute('href')).toBe('#dl-main');
    expect(link.textContent).toBe('Skip to content');
    link.dispatchEvent(new FocusEvent('focus'));
    link.click();
    expect(document.activeElement).toBe(document.getElementById('dl-main'));
    destroy();
  });

  it('has no skip link without a target', () => {
    const { target, destroy } = render(LayoutProbe, { main: false });
    expect(target.querySelector('.dl-skip-link')).toBeNull();
    destroy();
  });

  it('mounts one polite and one assertive live region that announce() fills', () => {
    const { target, destroy } = render(LayoutProbe, {});
    const polite = target.querySelector('[aria-live="polite"]')!;
    const assertive = target.querySelector('[aria-live="assertive"]')!;
    expect(polite.textContent?.trim()).toBe('');
    announce('12 dives match');
    announce('Save failed', { assertive: true });
    flushSync();
    expect(polite.textContent?.trim()).toBe('12 dives match');
    expect(assertive.textContent?.trim()).toBe('Save failed');
    destroy();
  });
});
