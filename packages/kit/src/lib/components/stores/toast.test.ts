import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { toast } from './toast.svelte';

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  for (const item of [...toast.items]) toast.dismiss(item.id);
  vi.useRealTimers();
});

describe('toast store', () => {
  it('shows a toast with the given kind and message', () => {
    toast.show({ kind: 'success', message: 'Gelukt!' });

    expect(toast.items).toHaveLength(1);
    expect(toast.items[0].kind).toBe('success');
    expect(toast.items[0].message).toBe('Gelukt!');
  });

  it('stacks multiple toasts with unique ids', () => {
    toast.show({ kind: 'success', message: 'Een' });
    toast.show({ kind: 'error', message: 'Twee' });

    expect(toast.items).toHaveLength(2);
    expect(toast.items[0].id).not.toBe(toast.items[1].id);
  });

  it('auto-dismisses a toast after 5 seconds', () => {
    toast.show({ kind: 'success', message: 'Tijdelijk' });
    expect(toast.items).toHaveLength(1);

    vi.advanceTimersByTime(5000);
    expect(toast.items).toHaveLength(0);
  });

  it('dismisses a toast manually', () => {
    toast.show({ kind: 'error', message: 'Weg ermee' });
    toast.dismiss(toast.items[0].id);

    expect(toast.items).toHaveLength(0);
  });

  it('ignores dismissing an unknown id', () => {
    toast.show({ kind: 'success', message: 'Blijft staan' });
    toast.dismiss('bestaat-niet');

    expect(toast.items).toHaveLength(1);
  });
});
