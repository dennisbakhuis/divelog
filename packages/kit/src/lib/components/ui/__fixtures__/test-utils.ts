import { flushSync, mount, tick, unmount, type Component } from 'svelte';

/** Mount a component into a fresh element attached to the document. */
export function render<Props extends Record<string, unknown>>(
  component: Component<Props>,
  props: Props,
): { target: HTMLElement; app: Record<string, unknown>; destroy: () => void } {
  const target = document.createElement('div');
  document.body.append(target);
  const app = mount(component, { target, props });
  flushSync();
  return {
    target,
    app,
    destroy: () => {
      unmount(app);
      target.remove();
    },
  };
}

/** Let effects, ticks and resolved promises run. */
export async function settle(): Promise<void> {
  for (let i = 0; i < 5; i++) await tick();
  await new Promise((r) => setTimeout(r, 0));
  flushSync();
}

/** Dispatch a bubbling keydown on an element. */
export function key(el: Element, k: string, init: KeyboardEventInit = {}): KeyboardEvent {
  const event = new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...init });
  el.dispatchEvent(event);
  flushSync();
  return event;
}
