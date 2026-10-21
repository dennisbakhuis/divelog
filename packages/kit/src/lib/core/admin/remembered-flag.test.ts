import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFlag, writeFlag } from './remembered-flag.js';

/** A `Storage` in memory; the test DOM has no storage of its own. */
function memoryStorage(): Storage {
  const data = new Map<string, string>();
  return {
    get length() {
      return data.size;
    },
    clear: () => data.clear(),
    getItem: (k: string) => data.get(k) ?? null,
    key: (i: number) => [...data.keys()][i] ?? null,
    removeItem: (k: string) => void data.delete(k),
    setItem: (k: string, v: string) => void data.set(k, String(v)),
  };
}

const denied = () => new DOMException('blocked', 'SecurityError');

beforeEach(() => vi.stubGlobal('localStorage', memoryStorage()));
afterEach(() => vi.unstubAllGlobals());

describe('remembered flag', () => {
  it('reads what it wrote, per key', () => {
    expect(readFlag('a')).toBe(false);
    writeFlag('a', true);
    expect(readFlag('a')).toBe(true);
    expect(readFlag('b')).toBe(false);
    expect(localStorage.getItem('a')).toBe('1');
    writeFlag('a', false);
    expect(readFlag('a')).toBe(false);
    expect(localStorage.getItem('a')).toBe('0');
  });

  it('reads false when the storage is empty, whatever an earlier page choice was', () => {
    writeFlag('c', true);
    localStorage.clear();
    expect(readFlag('c')).toBe(false);
  });

  it('keeps the choice in memory when the browser throws on storage access', () => {
    vi.stubGlobal('localStorage', undefined);
    const blocked = {
      get localStorage(): Storage {
        throw denied();
      },
    };
    vi.spyOn(globalThis, 'localStorage', 'get').mockImplementation(() => blocked.localStorage);
    expect(readFlag('d')).toBe(false);
    expect(() => writeFlag('d', true)).not.toThrow();
    expect(readFlag('d')).toBe(true);
    writeFlag('d', false);
    expect(readFlag('d')).toBe(false);
  });

  it('keeps the choice in memory when only writing throws', () => {
    const storage = memoryStorage();
    storage.setItem = () => {
      throw new DOMException('full', 'QuotaExceededError');
    };
    vi.stubGlobal('localStorage', storage);
    expect(() => writeFlag('e', true)).not.toThrow();
    expect(readFlag('e')).toBe(true);
  });

  it('lets the storage win again once it works', () => {
    const storage = memoryStorage();
    const setItem = storage.setItem;
    storage.setItem = () => {
      throw new DOMException('full', 'QuotaExceededError');
    };
    vi.stubGlobal('localStorage', storage);
    writeFlag('f', true);
    storage.setItem = setItem;
    writeFlag('f', false);
    expect(readFlag('f')).toBe(false);
  });
});
