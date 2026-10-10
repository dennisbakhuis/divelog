import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync } from 'svelte';
import DisclosureProbe from './__fixtures__/DisclosureProbe.svelte';
import { render } from './__fixtures__/test-utils.js';

class MemoryStorage {
  private data = new Map<string, string>();
  get length() {
    return this.data.size;
  }
  getItem(key: string) {
    return this.data.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    this.data.set(key, value);
  }
  clear() {
    this.data.clear();
  }
}

let localStorage: MemoryStorage;

beforeEach(() => {
  localStorage = new MemoryStorage();
  vi.stubGlobal('localStorage', localStorage);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function toggle(details: HTMLDetailsElement, open: boolean) {
  details.open = open;
  details.dispatchEvent(new Event('toggle'));
  flushSync();
}

describe('Disclosure', () => {
  it('renders a summary with a count badge and toggles', () => {
    const { target, destroy } = render(DisclosureProbe, { count: 3 });
    const details = target.querySelector('details')!;
    expect(details.open).toBe(false);
    expect(target.querySelector('summary')?.textContent).toContain('Transcription');
    expect(target.querySelector('.dl-disclosure-count')?.textContent).toBe('3');
    toggle(details, true);
    expect(details.open).toBe(true);
    expect(localStorage.length).toBe(0);
    destroy();
  });

  it('remembers its open state per key', () => {
    const first = render(DisclosureProbe, { persistKey: 'dive-form:transcription' });
    toggle(first.target.querySelector('details')!, true);
    expect(localStorage.getItem('dl-disclosure:dive-form:transcription')).toBe('1');
    first.destroy();

    const second = render(DisclosureProbe, { persistKey: 'dive-form:transcription' });
    expect(second.target.querySelector('details')!.open).toBe(true);
    expect(second.target.querySelector('.dl-disclosure-count')).toBeNull();
    toggle(second.target.querySelector('details')!, false);
    expect(localStorage.getItem('dl-disclosure:dive-form:transcription')).toBe('0');
    second.destroy();
  });

  it('works when storage throws', () => {
    vi.spyOn(localStorage, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    const { target, destroy } = render(DisclosureProbe, { persistKey: 'x', open: true });
    const details = target.querySelector('details')!;
    expect(details.open).toBe(true);
    toggle(details, false);
    expect(details.open).toBe(false);
    destroy();
  });
});
