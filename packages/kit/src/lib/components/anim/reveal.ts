import type { Action } from 'svelte/action';
import { reducedMotion } from './motion.js';

type RevealOptions = { delay?: number; stagger?: number; y?: number; once?: boolean };

/**
 * Svelte action: fade + rise the element (or its `[data-reveal]` children,
 * staggered) when it scrolls into view. Uses anime.js for the tween and an
 * IntersectionObserver as the trigger — cheap and exact.
 */
export const reveal: Action<HTMLElement, RevealOptions | undefined> = (node, options = {}) => {
  const { delay = 0, stagger = 70, y = 22, once = true } = options;
  const items = node.querySelectorAll<HTMLElement>('[data-reveal]');
  const targets = items.length ? Array.from(items) : [node];

  if (reducedMotion()) {
    return;
  }

  for (const el of targets) {
    el.style.opacity = '0';
    el.style.transform = `translateY(${y}px)`;
  }

  let played = false;
  const observer = new IntersectionObserver(
    (entries) => {
      if (!entries.some((e) => e.isIntersecting) || (once && played)) return;
      played = true;
      void import('animejs').then(({ animate, stagger: staggerFn }) => {
        animate(targets, {
          opacity: [0, 1],
          translateY: [y, 0],
          duration: 800,
          delay: staggerFn(stagger, { start: delay }),
          ease: 'outCubic',
        });
      });
      if (once) observer.disconnect();
    },
    // threshold 0: a tall section (a whole card grid) may never have 10 % of
    // itself on screen at once, and must still reveal as soon as its top enters.
    { rootMargin: '0px 0px -5% 0px', threshold: 0 },
  );
  observer.observe(node);

  return {
    destroy() {
      observer.disconnect();
    },
  };
};
