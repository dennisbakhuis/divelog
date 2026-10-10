import type { Action } from 'svelte/action';
import { reducedMotion } from './motion';

type InViewOptions = { threshold?: number; rootMargin?: string };

/**
 * Svelte action: mark the element `data-anim` as soon as it mounts and
 * `data-inview` once it scrolls into view, so CSS can hold a chart's bars at
 * zero until then and grow them in. Without JavaScript neither attribute
 * exists and the chart just renders. Reduced motion skips the wait.
 */
export const inView: Action<HTMLElement, InViewOptions | undefined> = (node, options = {}) => {
  if (reducedMotion()) {
    node.dataset.inview = '';
    return;
  }
  node.dataset.anim = '';
  const observer = new IntersectionObserver(
    (entries) => {
      if (!entries.some((e) => e.isIntersecting)) return;
      node.dataset.inview = '';
      observer.disconnect();
    },
    { rootMargin: options.rootMargin ?? '0px 0px -10% 0px', threshold: options.threshold ?? 0 },
  );
  observer.observe(node);
  return {
    destroy() {
      observer.disconnect();
    },
  };
};
