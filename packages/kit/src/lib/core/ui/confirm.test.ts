import { afterEach, describe, expect, it, vi } from 'vitest';
import { confirmDialog, confirmRequest, registerConfirmHost } from './confirm.js';

afterEach(() => vi.unstubAllGlobals());

describe('confirmDialog', () => {
  it('fills in labels from the options', () => {
    const plain = confirmRequest({ title: 'Discard changes?' }, () => {});
    expect(plain).toMatchObject({
      title: 'Discard changes?',
      body: '',
      confirmLabel: 'Confirm',
      cancelLabel: 'Cancel',
      danger: false,
    });
    const danger = confirmRequest(
      { title: 'Delete?', body: 'Gone for good.', danger: true },
      () => {},
    );
    expect(danger.confirmLabel).toBe('Delete');
    expect(danger.body).toBe('Gone for good.');
    const custom = confirmRequest(
      { title: 'Leave?', confirmLabel: 'Leave', cancelLabel: 'Stay' },
      () => {},
    );
    expect([custom.confirmLabel, custom.cancelLabel]).toEqual(['Leave', 'Stay']);
    expect(custom.id).not.toBe(plain.id);
  });

  it('resolves with the answer of the mounted host', async () => {
    const off = registerConfirmHost((request) => request.resolve(request.title === 'Yes?'));
    await expect(confirmDialog({ title: 'Yes?' })).resolves.toBe(true);
    await expect(confirmDialog({ title: 'No?' })).resolves.toBe(false);
    off();
  });

  it('falls back to the native confirm without a host', async () => {
    const native = vi.fn(() => true);
    vi.stubGlobal('confirm', native);
    await expect(confirmDialog({ title: 'Delete?', body: 'Really.' })).resolves.toBe(true);
    expect(native).toHaveBeenCalledWith('Delete?\n\nReally.');
    await confirmDialog({ title: 'Only a title' });
    expect(native).toHaveBeenLastCalledWith('Only a title');
    vi.stubGlobal('confirm', undefined);
    await expect(confirmDialog({ title: 'Nobody to ask' })).resolves.toBe(false);
  });
});
