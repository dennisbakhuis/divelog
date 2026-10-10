import { describe, expect, it } from 'vitest';
import { flushSync } from 'svelte';
import ConfirmProbe from './__fixtures__/ConfirmProbe.svelte';
import { key, render, settle } from './__fixtures__/test-utils.js';

describe('ConfirmDialog via confirmDialog()', () => {
  it('resolves true on confirm and false on Escape, focusing Cancel for danger', async () => {
    const answers: boolean[] = [];
    const { target, destroy } = render(ConfirmProbe, {
      options: { title: 'Delete dive #650?', body: 'Its attachments go too.', danger: true },
      answers,
    });
    const ask = target.querySelector<HTMLButtonElement>('.ask')!;
    ask.focus();
    ask.click();
    await settle();

    const dialog = target.querySelector('dialog')!;
    expect(dialog.hasAttribute('open')).toBe(true);
    expect(dialog.textContent).toContain('Delete dive #650?');
    expect(dialog.textContent).toContain('Its attachments go too.');
    const ok = dialog.querySelector<HTMLButtonElement>('.dl-confirm-ok')!;
    expect(ok.textContent).toBe('Delete');
    expect(ok.classList.contains('dl-btn-danger')).toBe(true);
    expect(document.activeElement).toBe(dialog.querySelector('.dl-confirm-cancel'));

    ok.click();
    await settle();
    expect(answers).toEqual([true]);
    expect(document.activeElement).toBe(ask);

    ask.click();
    await settle();
    key(document.activeElement!, 'Escape');
    await settle();
    expect(answers).toEqual([true, false]);
    destroy();
  });

  it('focuses the confirm button for a safe action and answers queued requests in turn', async () => {
    const answers: boolean[] = [];
    const { target, destroy } = render(ConfirmProbe, {
      options: { title: 'Discard changes?', confirmLabel: 'Discard' },
      answers,
    });
    const ask = target.querySelector<HTMLButtonElement>('.ask')!;
    ask.click();
    ask.click();
    await settle();
    let ok = target.querySelector<HTMLButtonElement>('.dl-confirm-ok')!;
    expect(ok.textContent).toBe('Discard');
    expect(ok.classList.contains('dl-btn-solid')).toBe(true);
    expect(document.activeElement).toBe(ok);
    target.querySelector<HTMLButtonElement>('.dl-confirm-cancel')!.click();
    await settle();
    expect(answers).toEqual([false]);

    ok = target.querySelector<HTMLButtonElement>('.dl-confirm-ok')!;
    expect(target.querySelector('dialog')?.hasAttribute('open')).toBe(true);
    ok.click();
    await settle();
    flushSync();
    expect(answers).toEqual([false, true]);
    destroy();
  });

  it('answers false for requests still open when the host goes away', async () => {
    const answers: boolean[] = [];
    const { target, destroy } = render(ConfirmProbe, { options: { title: 'Leave?' }, answers });
    target.querySelector<HTMLButtonElement>('.ask')!.click();
    await settle();
    destroy();
    await settle();
    expect(answers).toEqual([false]);
  });
});
