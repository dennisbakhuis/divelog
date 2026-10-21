import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { flushSync } from 'svelte';
import SignaturePad from './SignaturePad.svelte';
import { render } from './__fixtures__/test-utils.js';

type Props = {
  value?: number[][][];
  onchange?: (value: number[][][]) => void;
  label: string;
  description?: string;
  disabled?: boolean;
};

/** Mount the pad on a 500 × 200 px box, half the size of its 1000 × 400 units. */
function mountPad(props: Partial<Props> = {}) {
  const onchange = vi.fn();
  const view = render(SignaturePad, { label: 'Your signature', onchange, ...props });
  const svg = view.target.querySelector('svg')!;
  svg.getBoundingClientRect = () =>
    ({ left: 10, top: 20, width: 500, height: 200, right: 510, bottom: 220 }) as DOMRect;
  const capture = vi.fn();
  (svg as unknown as { setPointerCapture: (id: number) => void }).setPointerCapture = capture;
  return { ...view, svg, onchange, capture };
}

function pointer(
  el: Element,
  type: string,
  x: number,
  y: number,
  init: PointerEventInit = {},
): PointerEvent {
  const event = new PointerEvent(type, {
    bubbles: true,
    cancelable: true,
    pointerId: 7,
    pointerType: 'touch',
    button: 0,
    clientX: x,
    clientY: y,
    ...init,
  });
  el.dispatchEvent(event);
  flushSync();
  return event;
}

/** A finger stroke through page points: down on the first, moves, up on the last. */
function stroke(el: Element, points: number[][], init: PointerEventInit = {}) {
  const [first, ...rest] = points;
  pointer(el, 'pointerdown', first[0], first[1], init);
  for (const [x, y] of rest) pointer(el, 'pointermove', x, y, init);
  const last = points[points.length - 1];
  pointer(el, 'pointerup', last[0], last[1], init);
}

const ink = (svg: SVGSVGElement) => svg.querySelector('path')!.getAttribute('d');
const button = (target: HTMLElement, name: string) =>
  [...target.querySelectorAll('button')].find((b) => b.textContent?.trim() === name)!;

describe('SignaturePad', () => {
  it('is a labelled 1000 × 400 drawing with a description', () => {
    const { target, svg, destroy } = mountPad();
    expect(svg.getAttribute('viewBox')).toBe('0 0 1000 400');
    expect(svg.getAttribute('role')).toBe('img');
    expect(svg.getAttribute('aria-label')).toBe('Your signature');
    const description = document.getElementById(svg.getAttribute('aria-describedby')!);
    expect(description?.textContent).toContain('Draw with a finger');
    expect(description?.textContent).toContain('Nothing drawn yet.');
    expect(button(target, 'Undo').disabled).toBe(true);
    expect(button(target, 'Clear').disabled).toBe(true);
    destroy();
  });

  it('records a three-point finger stroke in box units', () => {
    const { svg, onchange, capture, destroy } = mountPad();
    const down = pointer(svg, 'pointerdown', 16, 170);
    expect(down.defaultPrevented).toBe(true);
    expect(capture).toHaveBeenCalledWith(7);
    pointer(svg, 'pointermove', 60, 120);
    expect(ink(svg)).toBe('M12 300 L100 200');
    pointer(svg, 'pointermove', 110, 70);
    pointer(svg, 'pointerup', 110, 70);
    expect(onchange).toHaveBeenCalledTimes(1);
    expect(onchange).toHaveBeenLastCalledWith([
      [
        [12, 300],
        [100, 200],
        [200, 100],
      ],
    ]);
    expect(ink(svg)).toBe('M12 300 L100 200 L200 100');
    const description = document.getElementById(svg.getAttribute('aria-describedby')!);
    expect(description?.textContent).toContain('1 stroke drawn.');
    destroy();
  });

  it('draws with a pen and a mouse too, but not with a right click', () => {
    const { svg, onchange, destroy } = mountPad();
    stroke(
      svg,
      [
        [10, 20],
        [60, 70],
      ],
      { pointerType: 'pen' },
    );
    stroke(
      svg,
      [
        [10, 20],
        [60, 70],
      ],
      { pointerType: 'mouse' },
    );
    stroke(
      svg,
      [
        [10, 20],
        [60, 70],
      ],
      { pointerType: 'mouse', button: 2 },
    );
    expect(onchange).toHaveBeenCalledTimes(2);
    expect(onchange.mock.lastCall![0]).toHaveLength(2);
    destroy();
  });

  it('makes a tap a dot of two points', () => {
    const { svg, onchange, destroy } = mountPad();
    pointer(svg, 'pointerdown', 260, 120);
    pointer(svg, 'pointerup', 260, 120);
    expect(onchange).toHaveBeenLastCalledWith([
      [
        [500, 200],
        [500, 200],
      ],
    ]);
    expect(ink(svg)).toBe('M500 200 L500 200');
    destroy();
  });

  it('clamps points outside the box to its edges', () => {
    const { svg, onchange, destroy } = mountPad();
    stroke(svg, [
      [-50, -50],
      [260, 120],
      [900, 900],
    ]);
    expect(onchange).toHaveBeenLastCalledWith([
      [
        [0, 0],
        [500, 200],
        [1000, 400],
      ],
    ]);
    destroy();
  });

  it('undoes the last stroke and clears them all', () => {
    const { target, svg, onchange, destroy } = mountPad();
    stroke(svg, [
      [10, 20],
      [60, 70],
    ]);
    stroke(svg, [
      [110, 20],
      [160, 70],
    ]);
    expect(onchange.mock.lastCall![0]).toHaveLength(2);
    button(target, 'Undo').click();
    flushSync();
    expect(onchange).toHaveBeenLastCalledWith([
      [
        [0, 0],
        [100, 100],
      ],
    ]);
    expect(ink(svg)).toBe('M0 0 L100 100');
    button(target, 'Clear').click();
    flushSync();
    expect(onchange).toHaveBeenLastCalledWith([]);
    expect(ink(svg)).toBe('');
    expect(button(target, 'Undo').disabled).toBe(true);
    destroy();
  });

  it('shows the strokes it is given', () => {
    const { target, svg, destroy } = mountPad({
      value: [
        [
          [1, 2],
          [3, 4],
        ],
      ],
    });
    expect(ink(svg)).toBe('M1 2 L3 4');
    expect(button(target, 'Clear').disabled).toBe(false);
    destroy();
  });

  it('follows one finger and ignores a second one while drawing', () => {
    const { svg, onchange, destroy } = mountPad();
    pointer(svg, 'pointerdown', 10, 20);
    pointer(svg, 'pointerdown', 300, 100, { pointerId: 8 });
    pointer(svg, 'pointermove', 300, 100, { pointerId: 8 });
    pointer(svg, 'pointermove', 60, 70);
    pointer(svg, 'pointerup', 300, 100, { pointerId: 8 });
    expect(onchange).not.toHaveBeenCalled();
    pointer(svg, 'pointerup', 60, 70);
    expect(onchange).toHaveBeenLastCalledWith([
      [
        [0, 0],
        [100, 100],
      ],
    ]);
    destroy();
  });

  it('keeps the stroke when the browser cancels the pointer', () => {
    const { svg, onchange, destroy } = mountPad();
    pointer(svg, 'pointerdown', 10, 20);
    pointer(svg, 'pointermove', 60, 70);
    pointer(svg, 'pointercancel', 60, 70);
    expect(onchange).toHaveBeenLastCalledWith([
      [
        [0, 0],
        [100, 100],
      ],
    ]);
    destroy();
  });

  it('draws nothing and offers no Undo or Clear when disabled', () => {
    const { target, svg, onchange, destroy } = mountPad({
      disabled: true,
      value: [
        [
          [1, 2],
          [3, 4],
        ],
      ],
    });
    stroke(svg, [
      [10, 20],
      [60, 70],
    ]);
    expect(onchange).not.toHaveBeenCalled();
    expect(button(target, 'Undo').disabled).toBe(true);
    expect(button(target, 'Clear').disabled).toBe(true);
    expect(target.textContent).toContain('Drawing is off.');
    destroy();
  });

  it('starts no stroke past the 60-stroke limit', () => {
    const dots = Array.from({ length: 60 }, () => [
      [1, 1],
      [1, 1],
    ]);
    const { target, svg, onchange, destroy } = mountPad({ value: dots });
    stroke(svg, [
      [10, 20],
      [60, 70],
    ]);
    expect(onchange).not.toHaveBeenCalled();
    expect(target.textContent).toContain('The pad is full');
    destroy();
  });

  it('stops a stroke at the 4000-point limit', () => {
    const long = Array.from({ length: 3998 }, (_, i) => [i % 1000, 1]);
    const { svg, onchange, destroy } = mountPad({ value: [long] });
    stroke(svg, [
      [10, 20],
      [60, 70],
      [110, 120],
      [160, 170],
    ]);
    const strokes = onchange.mock.lastCall![0] as number[][][];
    expect(strokes).toHaveLength(2);
    expect(strokes[1]).toHaveLength(2);
    destroy();
  });

  describe('from the keyboard', () => {
    const drawTwo = (svg: SVGSVGElement) => {
      stroke(svg, [
        [10, 20],
        [60, 70],
      ]);
      stroke(svg, [
        [110, 20],
        [160, 70],
      ]);
    };

    it('reaches Undo and Clear by Tab, after the drawing, and has no key trap', () => {
      const { target, svg, destroy } = mountPad();
      drawTwo(svg);
      const tools = [button(target, 'Undo'), button(target, 'Clear')];
      for (const tool of tools) {
        expect(tool.tabIndex).toBe(0);
        expect(tool.type).toBe('button');
      }
      expect(svg.compareDocumentPosition(tools[0]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      expect(svg.tabIndex).toBe(-1);
      destroy();
    });

    it('keeps focus on Undo while strokes remain', () => {
      const { target, svg, destroy } = mountPad();
      drawTwo(svg);
      const undo = button(target, 'Undo');
      undo.focus();
      undo.click();
      flushSync();
      expect(document.activeElement).toBe(undo);
      expect(undo.disabled).toBe(false);
      destroy();
    });

    it('moves focus to the pad when Undo or Clear empties it, so focus is not lost', () => {
      const { target, svg, destroy } = mountPad();
      stroke(svg, [
        [10, 20],
        [60, 70],
      ]);
      const undo = button(target, 'Undo');
      undo.focus();
      undo.click();
      flushSync();
      expect(undo.disabled).toBe(true);
      expect(document.activeElement).toBe(svg);

      drawTwo(svg);
      const clear = button(target, 'Clear');
      clear.focus();
      clear.click();
      flushSync();
      expect(document.activeElement).toBe(svg);
      destroy();
    });

    it('does not take focus when the buttons were not what the user was on', () => {
      const { target, svg, destroy } = mountPad();
      const elsewhere = document.createElement('input');
      document.body.append(elsewhere);
      stroke(svg, [
        [10, 20],
        [60, 70],
      ]);
      elsewhere.focus();
      button(target, 'Clear').click();
      flushSync();
      expect(document.activeElement).toBe(elsewhere);
      elsewhere.remove();
      destroy();
    });
  });

  it('puts a stroke on the corner, not NaN, when the pad has no size yet', () => {
    const { svg, onchange, destroy } = mountPad();
    svg.getBoundingClientRect = () => ({ left: 0, top: 0, width: 0, height: 0 }) as DOMRect;
    stroke(svg, [
      [10, 20],
      [60, 70],
    ]);
    expect(onchange.mock.lastCall![0]).toEqual([
      [
        [0, 0],
        [0, 0],
      ],
    ]);
    destroy();
  });

  it('keeps the page from scrolling under the finger and sizes its buttons for touch', () => {
    const src = readFileSync(
      join(process.cwd(), 'src/lib/components/ui/SignaturePad.svelte'),
      'utf8',
    );
    expect(src).toMatch(/\.dl-signature-pad \{[^}]*touch-action: none/);
    expect(src).toMatch(
      /@media \(pointer: coarse\) \{\s*\.dl-signature-tools \.dl-btn \{\s*min-height: var\(--dl-tap-min, 44px\)/,
    );
    expect(src).toMatch(/stroke: currentColor/);
  });
});
