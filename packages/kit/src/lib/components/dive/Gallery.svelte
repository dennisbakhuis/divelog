<script lang="ts">
  import type { Attachment } from '$lib/core/dive/types';

  let { items, kind }: { items: Attachment[]; kind: 'photo' | 'scan' | 'map' } = $props();
  let open = $state<Attachment | null>(null);

  function src(a: Attachment, variant: string): string {
    return a.variants[variant] ?? a.url;
  }

  function onKey(e: KeyboardEvent) {
    if (e.key === 'Escape') open = null;
  }
</script>

<svelte:window onkeydown={onKey} />

<div class="gallery" class:single={items.length === 1} class:scans={kind === 'scan'}>
  {#each items as item (item.id)}
    {#if item.mime.startsWith('image/')}
      <button
        type="button"
        class="thumb"
        onclick={() => (open = item)}
        aria-label="Open {kind} {item.caption || item.original_name}"
      >
        <img
          src={src(item, kind === 'scan' ? 'w800' : 'thumb')}
          alt={item.caption}
          loading="lazy"
          width={item.width ?? undefined}
          height={item.height ?? undefined}
        />
        {#if item.caption}<span class="caption">{item.caption}</span>{/if}
      </button>
    {:else}
      <a class="thumb file" href={item.url} target="_blank" rel="noopener">
        <span>{item.original_name || item.mime}</span>
        {#if item.caption}<span class="caption">{item.caption}</span>{/if}
      </a>
    {/if}
  {/each}
</div>

{#if open}
  <div class="lightbox" role="dialog" aria-modal="true" aria-label={open.caption || 'Image'}>
    <button type="button" class="backdrop" onclick={() => (open = null)} aria-label="Close"
    ></button>
    <figure>
      <img src={src(open, 'w1600')} alt={open.caption} />
      {#if open.caption}<figcaption>{open.caption}</figcaption>{/if}
    </figure>
    <button type="button" class="close" onclick={() => (open = null)} aria-label="Close">×</button>
  </div>
{/if}

<style>
  .gallery {
    display: grid;
    gap: 10px;
    grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  }
  .gallery.single,
  .gallery.scans {
    grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  }
  .thumb {
    position: relative;
    display: block;
    padding: 0;
    border: 1px solid var(--dl-color-border);
    border-radius: var(--dl-radius);
    overflow: hidden;
    background: var(--dl-color-surface);
    aspect-ratio: 4 / 3;
    cursor: zoom-in;
  }
  .scans .thumb {
    aspect-ratio: auto;
  }
  .thumb img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
  .scans .thumb img {
    object-fit: contain;
  }
  .file {
    display: flex;
    align-items: center;
    justify-content: center;
    text-decoration: none;
    color: var(--dl-color-text-muted);
    font-size: 14px;
    padding: 16px;
  }
  .caption {
    position: absolute;
    inset: auto 0 0;
    padding: 6px 10px;
    font-size: 12px;
    color: #fff;
    background: linear-gradient(transparent, rgba(0, 0, 0, 0.7));
    text-align: left;
  }
  .lightbox {
    position: fixed;
    inset: 0;
    z-index: 100;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 24px;
  }
  .backdrop {
    position: absolute;
    inset: 0;
    background: rgba(3, 9, 18, 0.92);
    border: none;
  }
  figure {
    position: relative;
    margin: 0;
    max-width: min(1400px, 100%);
    max-height: 100%;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  figure img {
    max-height: 85vh;
    max-width: 100%;
    object-fit: contain;
    border-radius: var(--dl-radius);
  }
  figcaption {
    color: var(--dl-color-text-muted);
    text-align: center;
    font-size: 14px;
  }
  .close {
    position: absolute;
    top: 16px;
    right: 20px;
    background: none;
    border: none;
    color: #fff;
    font-size: 36px;
    line-height: 1;
  }
</style>
