import { afterEach, describe, expect, it, vi } from 'vitest';
import { announce, hasLiveRegion, registerLiveRegion, resetAnnouncer } from './announce.js';

afterEach(() => resetAnnouncer());

describe('announce', () => {
  it('does nothing without a region and ignores blank text', () => {
    expect(hasLiveRegion()).toBe(false);
    expect(() => announce('Saved')).not.toThrow();
    const listener = vi.fn();
    registerLiveRegion(listener);
    announce('   ');
    expect(listener).not.toHaveBeenCalled();
  });

  it('sends polite and assertive messages to the first mounted region only', () => {
    const first = vi.fn();
    const second = vi.fn();
    const offFirst = registerLiveRegion(first);
    registerLiveRegion(second);
    expect(hasLiveRegion()).toBe(true);

    announce('Saved 12:03');
    announce('Save failed', { assertive: true });
    expect(first.mock.calls.map(([a]) => [a.text, a.politeness])).toEqual([
      ['Saved 12:03', 'polite'],
      ['Save failed', 'assertive'],
    ]);
    expect(second).not.toHaveBeenCalled();

    offFirst();
    announce('12 dives');
    expect(second).toHaveBeenCalledOnce();
    expect(second.mock.calls[0][0].text).toBe('12 dives');
  });

  it('changes a repeated message so it is spoken again', () => {
    const listener = vi.fn();
    registerLiveRegion(listener);
    announce('12 dives');
    announce('12 dives');
    announce('12 dives');
    const texts = listener.mock.calls.map(([a]) => a.text);
    expect(texts).toEqual(['12 dives', '12 dives ', '12 dives']);
    const seqs = listener.mock.calls.map(([a]) => a.seq);
    expect(new Set(seqs).size).toBe(3);
  });
});
