import { describe, expect, it } from 'vitest';
import FieldProbe from './__fixtures__/FieldProbe.svelte';
import { render } from './__fixtures__/test-utils.js';

describe('Field', () => {
  it('labels the control and leaves it valid without an error', () => {
    const { target, destroy } = render(FieldProbe, {});
    const input = target.querySelector('input')!;
    const label = target.querySelector('label')!;
    expect(label.htmlFor).toBe(input.id);
    expect(input.id).toMatch(/^dl-field-/);
    expect(input.hasAttribute('aria-invalid')).toBe(false);
    expect(input.hasAttribute('aria-describedby')).toBe(false);
    expect(input.required).toBe(false);
    expect(target.querySelector('.chip')?.textContent).toBe('from #649');
    expect(target.querySelector('.dl-field--stacked')).not.toBeNull();
    destroy();
  });

  it('links error, hint and extra descriptions in that order', () => {
    const { target, destroy } = render(FieldProbe, {
      id: 'max_depth_m',
      error: 'Field required',
      hint: 'Deepest point of the dive',
      describedby: 'units-note',
      layout: 'horizontal',
    });
    const input = target.querySelector('input')!;
    expect(input.id).toBe('max_depth_m');
    expect(input.getAttribute('aria-invalid')).toBe('true');
    expect(input.getAttribute('aria-describedby')).toBe(
      'max_depth_m-error max_depth_m-hint units-note',
    );
    expect(document.getElementById('max_depth_m-error')?.textContent).toContain('Field required');
    expect(document.getElementById('max_depth_m-hint')?.textContent).toBe(
      'Deepest point of the dive',
    );
    const field = target.querySelector('.dl-field')!;
    expect(field.classList.contains('dl-field--invalid')).toBe(true);
    expect(field.classList.contains('dl-field--horizontal')).toBe(true);
    expect(field.getAttribute('data-field')).toBe('max_depth_m');
    destroy();
  });
});
