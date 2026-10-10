import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/*
 * WCAG 2.2 AA on the default dark palette: text >= 4.5:1, control borders and
 * focus rings >= 3:1. Reads the fallbacks straight from tokens.css, so a
 * palette change that breaks contrast fails here.
 */

const css = readFileSync(join(process.cwd(), 'src/lib/styles/tokens.css'), 'utf8');

function token(name: string): string {
  const m = css.match(new RegExp(`--dl-${name}:\\s*var\\(--[\\w-]+,\\s*(#[0-9a-f]{6})\\)`, 'i'));
  if (!m) throw new Error(`no hex fallback for --dl-${name}`);
  return m[1];
}

function luminance(hex: string): number {
  const channel = (i: number) => {
    const c = parseInt(hex.slice(1 + 2 * i, 3 + 2 * i), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(0) + 0.7152 * channel(1) + 0.0722 * channel(2);
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const BACKGROUNDS = ['color-bg', 'color-bg-elevated', 'color-surface', 'color-surface-2'];

describe('palette contrast', () => {
  it.each([
    'color-text',
    'color-text-muted',
    'color-text-faint',
    'color-accent',
    'color-error',
    'color-danger',
    'color-warm',
  ])('%s reaches 4.5:1 on every background', (fg) => {
    for (const bg of BACKGROUNDS)
      expect(contrast(token(fg), token(bg))).toBeGreaterThanOrEqual(4.5);
  });

  it.each(['color-border-control', 'color-focus-ring'])(
    '%s reaches 3:1 on every background',
    (fg) => {
      for (const bg of BACKGROUNDS)
        expect(contrast(token(fg), token(bg))).toBeGreaterThanOrEqual(3);
    },
  );

  it('keeps button, danger and toast text readable on their fills', () => {
    expect(contrast(token('color-button-text'), token('color-button-bg'))).toBeGreaterThanOrEqual(
      4.5,
    );
    expect(contrast(token('color-danger-fg'), token('color-danger'))).toBeGreaterThanOrEqual(4.5);
    expect(contrast(token('color-success-fg'), token('color-success'))).toBeGreaterThanOrEqual(4.5);
  });
});
