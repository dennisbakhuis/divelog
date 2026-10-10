import { describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import AnnotationStale from './AnnotationStale.svelte';
import { fakeMap, staleAnnotation } from '$lib/testing/sharing';

describe('AnnotationStale', () => {
  it('explains the stale route, lists the legs it drops and re-pins on request', () => {
    const { map, annotation } = staleAnnotation();
    const onRepin = vi.fn();
    const target = document.createElement('div');
    const app = mount(AnnotationStale, { target, props: { annotation, maps: [map], onRepin } });
    flushSync();

    expect(target.textContent).toContain(
      'The map changed since this route was drawn (map revision 2 → 3); 1 leg no longer resolves.',
    );
    expect(target.querySelector('.legs')?.textContent?.replace(/\s+/g, ' ').trim()).toBe(
      'Re-pinning drops B → x.',
    );
    const button = target.querySelector('button')!;
    expect(button.textContent).toBe('Re-pin route to the current map');
    button.click();
    expect(onRepin).toHaveBeenCalledOnce();
    const [pinned, dropped] = onRepin.mock.calls[0];
    expect(pinned.revision).toBe(3);
    expect(pinned.route).toEqual([{ from: 'a', to: 'b' }]);
    expect(dropped).toEqual([{ from: 'b', to: 'x' }]);
    unmount(app);
  });

  it('shows the revision change alone when every leg still resolves', () => {
    const { map, annotation } = staleAnnotation();
    const target = document.createElement('div');
    const app = mount(AnnotationStale, {
      target,
      props: {
        annotation: { ...annotation, route: [{ from: 'a', to: 'b' }], turn: 'b' },
        maps: [map],
        busy: true,
        onRepin: () => {},
      },
    });
    flushSync();
    expect(target.textContent).toContain('every leg still resolves');
    expect(target.querySelector('.legs')).toBeNull();
    expect(target.querySelector('button')?.disabled).toBe(true);
    expect(target.querySelector('button')?.textContent).toBe('Re-pinning…');
    unmount(app);
  });

  it('stays silent for a current route, no route or a map that is not loaded', () => {
    const { annotation } = staleAnnotation();
    const current = fakeMap({ revision: 2, edges: [...fakeMap().edges] });
    for (const props of [
      { annotation: { ...annotation, route: [{ from: 'a', to: 'b' }] }, maps: [current] },
      { annotation: null, maps: [current] },
      { annotation, maps: [] },
    ]) {
      const target = document.createElement('div');
      const app = mount(AnnotationStale, { target, props: { ...props, onRepin: () => {} } });
      flushSync();
      expect(target.querySelector('.stale')).toBeNull();
      unmount(app);
    }
  });
});
