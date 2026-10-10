import { describe, expect, it, vi } from 'vitest';
import { flushSync, mount, tick, unmount } from 'svelte';
import ObjectPicker from './ObjectPicker.svelte';
import { OBJECT_KINDS } from '$lib/core/dive/sitemap';

describe('ObjectPicker', () => {
  it('is a radio group with roving focus that reports the picked kind', async () => {
    const target = document.createElement('div');
    document.body.append(target);
    const onchange = vi.fn();
    const app = mount(ObjectPicker, {
      target,
      props: { value: OBJECT_KINDS[0].kind, onchange, compact: true },
    });
    flushSync();
    const group = target.querySelector('[role="radiogroup"]')!;
    expect(group.getAttribute('aria-label')).toBe('Object');
    const radios = [...target.querySelectorAll<HTMLButtonElement>('[role="radio"]')];
    expect(radios).toHaveLength(OBJECT_KINDS.length);
    expect(radios[0].getAttribute('aria-checked')).toBe('true');
    expect(radios[0].textContent?.trim()).toBe(OBJECT_KINDS[0].label);
    expect(radios.filter((r) => r.tabIndex === 0)).toHaveLength(1);

    radios[0].focus();
    radios[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    flushSync();
    await tick();
    expect(onchange).toHaveBeenCalledWith(OBJECT_KINDS[1].kind);

    radios[2].click();
    expect(onchange).toHaveBeenLastCalledWith(OBJECT_KINDS[2].kind);
    unmount(app);
    target.remove();
  });
});
