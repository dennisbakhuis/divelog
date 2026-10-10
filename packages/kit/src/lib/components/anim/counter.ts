import type { Action } from 'svelte/action';
import { reducedMotion } from './motion';

type CounterOptions = {
  value: number;
  decimals?: number;
  duration?: number;
  suffix?: string;
  /** Digit grouping ("2,005"); turn it off for years. Defaults to on. */
  group?: boolean;
};

export function formatCount(value: number, decimals: number, group = true): string {
  return value.toLocaleString('en-GB', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
    useGrouping: group,
  });
}

/** Svelte action: count the element's number up from zero when it becomes visible. */
export const counter: Action<HTMLElement, CounterOptions> = (node, options) => {
  let current = options;
  const text = (v: number) =>
    `${formatCount(v, current.decimals ?? 0, current.group ?? true)}${current.suffix ?? ''}`;
  const finalText = () => text(current.value);

  if (reducedMotion()) {
    node.textContent = finalText();
    return;
  }

  node.textContent = `0${current.suffix ?? ''}`;
  const observer = new IntersectionObserver(
    (entries) => {
      if (!entries.some((e) => e.isIntersecting)) return;
      observer.disconnect();
      void import('animejs').then(({ animate }) => {
        const state = { v: 0 };
        animate(state, {
          v: current.value,
          duration: current.duration ?? 1600,
          ease: 'outExpo',
          onUpdate: () => {
            node.textContent = text(state.v);
          },
          onComplete: () => {
            node.textContent = finalText();
          },
        });
      });
    },
    { threshold: 0.4 },
  );
  observer.observe(node);

  return {
    update(next) {
      current = next;
      node.textContent = finalText();
    },
    destroy() {
      observer.disconnect();
    },
  };
};
