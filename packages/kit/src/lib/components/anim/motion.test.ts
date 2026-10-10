import { describe, expect, it } from 'vitest';
import { gradientAt, hexToRgb, mixHex } from './motion';

describe('colour helpers', () => {
  it('parses hex', () => {
    expect(hexToRgb('#ffffff')).toEqual([255, 255, 255]);
    expect(hexToRgb('#000')).toEqual([0, 0, 0]);
  });

  it('mixes and clamps', () => {
    expect(mixHex('#000000', '#ffffff', 0.5)).toBe('rgb(128 128 128)');
    expect(mixHex('#000000', '#ffffff', 2)).toBe('rgb(255 255 255)');
    expect(mixHex('#000000', '#ffffff', -1)).toBe('rgb(0 0 0)');
  });

  it('walks gradient stops', () => {
    const stops = [
      { at: 0, color: '#000000' },
      { at: 0.5, color: '#ffffff' },
      { at: 1, color: '#000000' },
    ];
    expect(gradientAt(stops, 0)).toBe('rgb(0 0 0)');
    expect(gradientAt(stops, 0.25)).toBe('rgb(128 128 128)');
    expect(gradientAt(stops, 0.5)).toBe('rgb(255 255 255)');
    expect(gradientAt(stops, 1)).toBe('rgb(0 0 0)');
  });
});
