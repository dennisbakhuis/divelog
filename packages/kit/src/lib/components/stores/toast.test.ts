import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import { toast } from './toast.svelte';
import { registerLiveRegion, resetAnnouncer } from '$lib/core/ui/announce.js';
import Toast from '$lib/components/shell/Toast.svelte';

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  for (const item of [...toast.items]) toast.dismiss(item.id);
  resetAnnouncer();
  vi.useRealTimers();
});

describe('toast store', () => {
  it('shows a toast with the given kind and message', () => {
    toast.show({ kind: 'success', message: 'Gelukt!' });

    expect(toast.items).toHaveLength(1);
    expect(toast.items[0].kind).toBe('success');
    expect(toast.items[0].message).toBe('Gelukt!');
    expect(toast.items[0].sticky).toBe(false);
  });

  it('stacks multiple toasts with unique ids', () => {
    toast.show({ kind: 'success', message: 'Een' });
    toast.show({ kind: 'error', message: 'Twee' });

    expect(toast.items).toHaveLength(2);
    expect(toast.items[0].id).not.toBe(toast.items[1].id);
  });

  it('auto-dismisses a success toast after 5 seconds', () => {
    toast.show({ kind: 'success', message: 'Tijdelijk' });
    expect(toast.items).toHaveLength(1);

    vi.advanceTimersByTime(5000);
    expect(toast.items).toHaveLength(0);
  });

  it('keeps errors until dismissed, unless told otherwise', () => {
    toast.show({ kind: 'error', message: 'Blijft' });
    toast.show({ kind: 'error', message: 'Gaat weg', sticky: false, duration: 1000 });
    toast.show({ kind: 'info', message: 'Ook blijvend', sticky: true });
    vi.advanceTimersByTime(60_000);
    expect(toast.items.map((t) => t.message)).toEqual(['Blijft', 'Ook blijvend']);
    expect(toast.items.every((t) => t.sticky)).toBe(true);
  });

  it('pauses the clock and resumes with the time that was left', () => {
    const id = toast.show({ kind: 'success', message: 'Even wachten' });
    vi.advanceTimersByTime(3000);
    toast.pause(id);
    toast.pause(id);
    vi.advanceTimersByTime(10_000);
    expect(toast.items).toHaveLength(1);
    toast.resume(id);
    vi.advanceTimersByTime(1999);
    expect(toast.items).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(toast.items).toHaveLength(0);
    expect(() => toast.resume(id)).not.toThrow();
  });

  it('announces success politely and errors assertively', () => {
    const heard: [string, string][] = [];
    registerLiveRegion((a) => heard.push([a.text, a.politeness]));
    toast.show({ kind: 'success', message: 'Opgeslagen' });
    toast.show({ kind: 'error', message: 'Mislukt' });
    toast.show({ kind: 'info', message: 'Let op' });
    expect(heard).toEqual([
      ['Opgeslagen', 'polite'],
      ['Mislukt', 'assertive'],
      ['Let op', 'polite'],
    ]);
  });

  it('dismisses a toast manually', () => {
    toast.show({ kind: 'error', message: 'Weg ermee' });
    toast.dismiss(toast.items[0].id);

    expect(toast.items).toHaveLength(0);
  });

  it('makes ids without crypto.randomUUID, which plain http on a LAN lacks', () => {
    vi.stubGlobal('crypto', {});
    try {
      const a = toast.show({ kind: 'success', message: 'Een' });
      const b = toast.show({ kind: 'success', message: 'Twee' });
      expect(a).not.toBe(b);
      expect(toast.items.map((t) => t.id)).toEqual([a, b]);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('keeps at most three toasts, pushing out the oldest non-sticky one first', () => {
    toast.show({ kind: 'error', message: 'Fout 1' });
    toast.show({ kind: 'success', message: 'Klaar 1' });
    toast.show({ kind: 'error', message: 'Fout 2' });
    toast.show({ kind: 'success', message: 'Klaar 2' });
    expect(toast.items.map((t) => t.message)).toEqual(['Fout 1', 'Fout 2', 'Klaar 2']);
    toast.show({ kind: 'info', message: 'Let op' });
    expect(toast.items.map((t) => t.message)).toEqual(['Fout 1', 'Fout 2', 'Let op']);
    toast.show({ kind: 'error', message: 'Fout 3' });
    toast.show({ kind: 'error', message: 'Fout 4' });
    expect(toast.items.map((t) => t.message)).toEqual(['Fout 2', 'Fout 3', 'Fout 4']);
    toast.show({ kind: 'success', message: 'Klaar 3' });
    expect(toast.items.map((t) => t.message)).toEqual(['Fout 3', 'Fout 4', 'Klaar 3']);
    vi.advanceTimersByTime(60_000);
    expect(toast.items.map((t) => t.message)).toEqual(['Fout 3', 'Fout 4']);
  });

  it('ignores dismissing an unknown id', () => {
    toast.show({ kind: 'success', message: 'Blijft staan' });
    toast.dismiss('bestaat-niet');

    expect(toast.items).toHaveLength(1);
  });
});

describe('Toast', () => {
  it('keeps its container and live regions mounted and speaks through them', () => {
    const target = document.createElement('div');
    document.body.append(target);
    const app = mount(Toast, { target });
    flushSync();
    expect(target.querySelector('.toast-container')).not.toBeNull();
    const polite = target.querySelector('[aria-live="polite"]')!;
    const assertive = target.querySelector('[aria-live="assertive"]')!;
    expect(polite.getAttribute('role')).toBe('status');
    expect(assertive.getAttribute('role')).toBe('alert');

    toast.show({ kind: 'success', message: 'Saved' });
    toast.show({ kind: 'error', message: 'Save failed' });
    flushSync();
    expect(polite.textContent?.trim()).toBe('Saved');
    expect(assertive.textContent?.trim()).toBe('Save failed');
    const items = target.querySelectorAll('.toast');
    expect([...items].map((i) => i.getAttribute('data-kind'))).toEqual(['success', 'error']);

    items[0].dispatchEvent(new MouseEvent('mouseenter'));
    vi.advanceTimersByTime(10_000);
    flushSync();
    expect(target.querySelectorAll('.toast')).toHaveLength(2);
    items[0].dispatchEvent(new MouseEvent('mouseleave'));
    vi.advanceTimersByTime(5000);
    flushSync();
    expect(target.querySelectorAll('.toast')).toHaveLength(1);

    const close = target.querySelector<HTMLButtonElement>('.toast-close')!;
    expect(close.getAttribute('aria-label')).toBe('Dismiss: Save failed');
    close.click();
    flushSync();
    expect(target.querySelectorAll('.toast')).toHaveLength(0);
    expect(target.querySelector('.toast-container')).not.toBeNull();

    unmount(app);
    target.remove();
  });
});
