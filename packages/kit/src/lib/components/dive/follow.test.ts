import { beforeEach, describe, expect, it, vi } from 'vitest';

const navigation = vi.hoisted(() => ({ goto: vi.fn(async () => undefined) }));
vi.mock('$app/navigation', () => navigation);

import { followWithState, stateFrom } from './follow.js';

function click(init: MouseEventInit = {}, target = '') {
  const link = document.createElement('a');
  link.href = '/dive/5';
  if (target) link.target = target;
  let prevented = false;
  link.addEventListener('click', (e) => {
    followWithState(e, '/dive/5', { from: '/dive?tag=cave' });
    prevented = e.defaultPrevented;
    e.preventDefault();
  });
  document.body.append(link);
  link.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, ...init }));
  link.remove();
  return { defaultPrevented: prevented };
}

describe('followWithState', () => {
  beforeEach(() => navigation.goto.mockClear());

  it('navigates a plain click with the state', () => {
    const event = click();
    expect(event.defaultPrevented).toBe(true);
    expect(navigation.goto).toHaveBeenCalledWith('/dive/5', { state: { from: '/dive?tag=cave' } });
  });

  it.each([
    { metaKey: true },
    { ctrlKey: true },
    { shiftKey: true },
    { altKey: true },
    { button: 1 },
  ])('leaves a modified click to the browser (%o)', (init) => {
    const event = click(init);
    expect(event.defaultPrevented).toBe(false);
    expect(navigation.goto).not.toHaveBeenCalled();
  });

  it('leaves a link with a target alone', () => {
    expect(click({}, '_blank').defaultPrevented).toBe(false);
    expect(navigation.goto).not.toHaveBeenCalled();
  });
});

describe('stateFrom', () => {
  it('reads a string `from` and nothing else', () => {
    expect(stateFrom({ from: '/dive?q=x' })).toBe('/dive?q=x');
    expect(stateFrom({ from: 3 })).toBeUndefined();
    expect(stateFrom(null)).toBeUndefined();
    expect(stateFrom('x')).toBeUndefined();
  });
});
