import { announce } from '$lib/core/ui/announce.js';

export type ToastKind = 'success' | 'error' | 'info';

export interface ToastItem {
  id: string;
  kind: ToastKind;
  message: string;
  /** Stays until dismissed; errors are sticky unless told otherwise. */
  sticky: boolean;
}

export interface ToastOptions {
  kind: ToastKind;
  message: string;
  /** Default `true` for errors, `false` otherwise. */
  sticky?: boolean;
  /** Time on screen for a non-sticky toast, in milliseconds. */
  duration?: number;
}

export const TOAST_DURATION_MS = 5000;

/** Most toasts on screen at once; a newer one pushes out the oldest, non-sticky first. */
export const TOAST_LIMIT = 3;

interface Timer {
  handle: ReturnType<typeof setTimeout> | null;
  remaining: number;
  started: number;
}

function createToastStore() {
  const items = $state<ToastItem[]>([]);
  const timers: Record<string, Timer> = {};
  let seq = 0;

  function start(id: string) {
    const timer = timers[id];
    if (!timer || timer.handle) return;
    timer.started = Date.now();
    timer.handle = setTimeout(() => dismiss(id), timer.remaining);
  }

  /** Show a toast and announce it: politely for success and info, assertively for errors. */
  function show({ kind, message, sticky, duration = TOAST_DURATION_MS }: ToastOptions): string {
    const id = `dl-toast-${++seq}`;
    const keep = sticky ?? kind === 'error';
    items.push({ id, kind, message, sticky: keep });
    while (items.length > TOAST_LIMIT) {
      const oldest = items.slice(0, -1).find((t) => !t.sticky) ?? items[0];
      dismiss(oldest.id);
    }
    announce(message, { assertive: kind === 'error' });
    if (!keep) {
      timers[id] = { handle: null, remaining: duration, started: 0 };
      start(id);
    }
    return id;
  }

  /** Stop the clock of a toast while the pointer or focus is on it. */
  function pause(id: string) {
    const timer = timers[id];
    if (!timer?.handle) return;
    clearTimeout(timer.handle);
    timer.handle = null;
    timer.remaining = Math.max(0, timer.remaining - (Date.now() - timer.started));
  }

  /** Restart the clock with the time that was left. */
  function resume(id: string) {
    start(id);
  }

  function dismiss(id: string) {
    const timer = timers[id];
    if (timer?.handle) clearTimeout(timer.handle);
    delete timers[id];
    const idx = items.findIndex((t) => t.id === id);
    if (idx !== -1) items.splice(idx, 1);
  }

  return {
    get items() {
      return items;
    },
    show,
    pause,
    resume,
    dismiss,
  };
}

export const toast = createToastStore();
