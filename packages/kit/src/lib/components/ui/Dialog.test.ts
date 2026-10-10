import { afterEach, describe, expect, it, vi } from 'vitest';
import { flushSync } from 'svelte';
import DialogProbe from './__fixtures__/DialogProbe.svelte';
import { key, render, settle } from './__fixtures__/test-utils.js';

const proto = HTMLDialogElement.prototype as Partial<HTMLDialogElement>;

afterEach(() => {
  delete proto.showModal;
  delete proto.close;
});

describe('Dialog', () => {
  it('opens labelled, focuses the first control, closes on Escape and returns focus', () => {
    const onclose = vi.fn();
    const { target, destroy } = render(DialogProbe, { onclose });
    const opener = target.querySelector<HTMLButtonElement>('.opener')!;
    const dialog = target.querySelector('dialog')!;
    expect(dialog.hasAttribute('open')).toBe(false);
    expect(dialog.querySelector('input')).toBeNull();

    opener.focus();
    opener.click();
    flushSync();
    expect(dialog.hasAttribute('open')).toBe(true);
    const title = document.getElementById(dialog.getAttribute('aria-labelledby')!)!;
    expect(title.textContent).toBe('Edit tank');
    expect(document.getElementById(dialog.getAttribute('aria-describedby')!)?.textContent).toBe(
      'Cylinder and gas',
    );
    expect(document.activeElement).toBe(dialog.querySelector('input.first'));

    const escape = key(document.activeElement!, 'Escape');
    expect(escape.defaultPrevented).toBe(true);
    expect(dialog.hasAttribute('open')).toBe(false);
    expect(document.activeElement).toBe(opener);
    expect(onclose).toHaveBeenCalledOnce();
    destroy();
  });

  it('keeps other keys from reaching page shortcuts behind it', () => {
    const { target, destroy } = render(DialogProbe, { open: true });
    const onWindow = vi.fn();
    window.addEventListener('keydown', onWindow);
    key(target.querySelector('input.first')!, 'a');
    expect(onWindow).not.toHaveBeenCalled();
    window.removeEventListener('keydown', onWindow);
    destroy();
  });

  it('closes from the close button, the backdrop and a footer action', () => {
    const { target, destroy } = render(DialogProbe, { open: true });
    const dialog = target.querySelector('dialog')!;
    const reopen = () => {
      target.querySelector<HTMLButtonElement>('.opener')!.click();
      flushSync();
      expect(dialog.hasAttribute('open')).toBe(true);
    };
    expect(dialog.hasAttribute('open')).toBe(true);
    const close = dialog.querySelector<HTMLButtonElement>('.dl-dialog-close')!;
    expect(close.getAttribute('aria-label')).toBe('Close');
    close.click();
    flushSync();
    expect(dialog.hasAttribute('open')).toBe(false);

    reopen();
    dialog.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    flushSync();
    expect(dialog.hasAttribute('open')).toBe(false);

    reopen();
    dialog.querySelector<HTMLElement>('.dl-dialog-content')!.click();
    flushSync();
    expect(dialog.hasAttribute('open')).toBe(true);
    dialog.querySelector<HTMLButtonElement>('.save')!.click();
    flushSync();
    expect(dialog.hasAttribute('open')).toBe(false);
    destroy();
  });

  it('uses the label without a title and closes a bare dialog on its empty area', () => {
    const { target, destroy } = render(DialogProbe, { open: true, bare: true });
    const dialog = target.querySelector('dialog')!;
    expect(dialog.getAttribute('aria-label')).toBe('Photo');
    expect(dialog.hasAttribute('aria-labelledby')).toBe(false);
    expect(dialog.classList.contains('dl-dialog--bare')).toBe(true);
    dialog.querySelector<HTMLElement>('.dl-dialog-content')!.click();
    flushSync();
    expect(dialog.hasAttribute('open')).toBe(false);
    destroy();
  });

  it('drives a native modal dialog and follows its cancel and close events', async () => {
    proto.showModal = function (this: HTMLDialogElement) {
      this.setAttribute('open', '');
    };
    proto.close = function (this: HTMLDialogElement) {
      this.removeAttribute('open');
      this.dispatchEvent(new Event('close'));
    };
    const onclose = vi.fn();
    const { target, destroy } = render(DialogProbe, { onclose });
    const dialog = target.querySelector('dialog')!;
    target.querySelector<HTMLButtonElement>('.opener')!.click();
    flushSync();
    expect(dialog.open).toBe(true);

    const cancel = new Event('cancel', { cancelable: true });
    dialog.dispatchEvent(cancel);
    flushSync();
    expect(cancel.defaultPrevented).toBe(true);
    expect(dialog.open).toBe(false);
    expect(onclose).toHaveBeenCalledOnce();

    target.querySelector<HTMLButtonElement>('.opener')!.click();
    flushSync();
    dialog.close();
    await settle();
    expect(onclose).toHaveBeenCalledTimes(2);
    expect(dialog.querySelector('input')).toBeNull();
    destroy();
  });
});
