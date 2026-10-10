import { describe, expect, it } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import Gallery from './Gallery.svelte';
import type { Attachment } from '$lib/core/dive/types';

function photo(id: string, caption: string): Attachment {
  return {
    id,
    kind: 'photo',
    mime: 'image/jpeg',
    bytes: 1000,
    width: 800,
    height: 600,
    caption,
    credit: '',
    sort: 0,
    public: true,
    taken_at: null,
    original_name: `${id}.jpg`,
    url: `/media/${id}.jpg`,
    variants: { thumb: `/media/${id}-thumb.jpg`, w1600: `/media/${id}-1600.jpg` },
  } as unknown as Attachment;
}

describe('Gallery lightbox', () => {
  it('opens a labelled modal dialog and returns focus to the thumbnail on Escape', () => {
    const target = document.createElement('div');
    document.body.append(target);
    const app = mount(Gallery, {
      target,
      props: { items: [photo('a', 'The halocline'), photo('b', '')], kind: 'photo' },
    });
    flushSync();
    const dialog = target.querySelector('dialog')!;
    expect(dialog.hasAttribute('open')).toBe(false);

    const thumb = target.querySelector<HTMLButtonElement>('button.thumb')!;
    expect(thumb.getAttribute('aria-label')).toBe('Open photo The halocline');
    thumb.focus();
    thumb.click();
    flushSync();
    expect(dialog.hasAttribute('open')).toBe(true);
    expect(dialog.getAttribute('aria-label')).toBe('The halocline');
    expect(dialog.querySelector('img')?.getAttribute('src')).toBe('/media/a-1600.jpg');
    expect(dialog.querySelector('figcaption')?.textContent).toBe('The halocline');
    expect(document.activeElement).toBe(dialog.querySelector('.dl-dialog-close'));

    document.activeElement!.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }),
    );
    flushSync();
    expect(dialog.hasAttribute('open')).toBe(false);
    expect(document.activeElement).toBe(thumb);

    target.querySelectorAll<HTMLButtonElement>('button.thumb')[1].click();
    flushSync();
    expect(dialog.getAttribute('aria-label')).toBe('Image');
    dialog.querySelector<HTMLButtonElement>('.dl-dialog-close')!.click();
    flushSync();
    expect(dialog.hasAttribute('open')).toBe(false);

    unmount(app);
    target.remove();
  });
});
