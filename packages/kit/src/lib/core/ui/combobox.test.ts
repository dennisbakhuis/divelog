import { describe, expect, it } from 'vitest';
import {
  filterOptions,
  flattenGroups,
  groupOptions,
  moveActive,
  normalizeText,
  uniqueOptions,
  type ComboOption,
} from './combobox.js';

const OPTIONS: ComboOption[] = [
  { value: 'a', label: 'Cénote Azul', group: 'All' },
  { value: 'b', label: 'Blue Hole', group: 'Recent', hint: 'Dahab' },
  { value: 'c', label: 'Closed', disabled: true },
  { value: 'd', label: 'Dos Ojos', group: 'All', keywords: 'cave tulum' },
];

describe('combobox helpers', () => {
  it('normalises case and accents', () => {
    expect(normalizeText('  Cénote ÀZUL ')).toBe('cenote azul');
  });

  it('filters on every word across label, hint, keywords and value', () => {
    expect(filterOptions(OPTIONS, '').map((o) => o.value)).toEqual(['a', 'b', 'c', 'd']);
    expect(filterOptions(OPTIONS, 'cenote').map((o) => o.value)).toEqual(['a']);
    expect(filterOptions(OPTIONS, 'dahab hole').map((o) => o.value)).toEqual(['b']);
    expect(filterOptions(OPTIONS, 'tulum').map((o) => o.value)).toEqual(['d']);
    expect(filterOptions(OPTIONS, 'nothing here')).toEqual([]);
  });

  it('groups in first-seen order with ungrouped options first', () => {
    const groups = groupOptions(OPTIONS);
    expect(groups.map((g) => [g.group, g.options.map((o) => o.value)])).toEqual([
      ['', ['c']],
      ['All', ['a', 'd']],
      ['Recent', ['b']],
    ]);
    expect(flattenGroups(groups).map((o) => o.value)).toEqual(['c', 'a', 'd', 'b']);
  });

  it('drops repeated values', () => {
    expect(uniqueOptions([...OPTIONS, { value: 'a', label: 'again' }]).map((o) => o.label)).toEqual(
      ['Cénote Azul', 'Blue Hole', 'Closed', 'Dos Ojos'],
    );
  });

  it('moves past disabled options and wraps', () => {
    expect(moveActive(OPTIONS, -1, 'ArrowDown')).toBe(0);
    expect(moveActive(OPTIONS, -1, 'ArrowUp')).toBe(3);
    expect(moveActive(OPTIONS, 1, 'ArrowDown')).toBe(3);
    expect(moveActive(OPTIONS, 3, 'ArrowDown')).toBe(0);
    expect(moveActive(OPTIONS, 0, 'ArrowUp')).toBe(3);
    expect(moveActive(OPTIONS, 3, 'ArrowUp')).toBe(1);
    expect(moveActive(OPTIONS, 2, 'Home')).toBe(0);
    expect(moveActive(OPTIONS, 0, 'End')).toBe(3);
    expect(moveActive([], 0, 'ArrowDown')).toBe(-1);
    expect(moveActive([{ value: 'x', label: 'x', disabled: true }], -1, 'End')).toBe(-1);
  });
});
