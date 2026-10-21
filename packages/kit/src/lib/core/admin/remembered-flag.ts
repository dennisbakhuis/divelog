/** A yes/no choice remembered on this device, kept in memory when the browser blocks storage. */

const memory = new Map<string, boolean>();

/** The remembered choice under `key`; false when nothing was remembered. */
export function readFlag(key: string): boolean {
  try {
    const stored = globalThis.localStorage?.getItem(key);
    if (stored === '1' || stored === '0') return stored === '1';
  } catch {
    // storage blocked: fall through to what this page remembers
  }
  return memory.get(key) ?? false;
}

/** Remember the choice under `key`; without storage it lasts until the page is reloaded. */
export function writeFlag(key: string, value: boolean): void {
  try {
    globalThis.localStorage?.setItem(key, value ? '1' : '0');
    memory.delete(key);
  } catch {
    memory.set(key, value);
  }
}
