import { browser } from '$app/environment';

/** True when the visitor asked for less motion; every animation checks this first. */
export function reducedMotion(): boolean {
  if (!browser) return true;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** Linear interpolation between two hex colours, returned as rgb(). */
export function mixHex(a: string, b: string, t: number): string {
  const pa = hexToRgb(a);
  const pb = hexToRgb(b);
  const k = Math.min(1, Math.max(0, t));
  const c = pa.map((v, i) => Math.round(v + (pb[i] - v) * k));
  return `rgb(${c[0]} ${c[1]} ${c[2]})`;
}

export function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  const n = parseInt(
    h.length === 3
      ? h
          .split('')
          .map((c) => c + c)
          .join('')
      : h,
    16,
  );
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Piecewise interpolation over colour stops at 0..1. */
export function gradientAt(stops: { at: number; color: string }[], t: number): string {
  const k = Math.min(1, Math.max(0, t));
  for (let i = 1; i < stops.length; i++) {
    if (k <= stops[i].at) {
      const span = stops[i].at - stops[i - 1].at || 1;
      return mixHex(stops[i - 1].color, stops[i].color, (k - stops[i - 1].at) / span);
    }
  }
  return mixHex(stops[stops.length - 1].color, stops[stops.length - 1].color, 1);
}
