<script lang="ts">
  import type { SiteOrigin } from '$lib/core/dive/types';
  import { ORIGIN_LABEL } from '$lib/core/dive/sharing';

  let {
    origin,
    detail,
    title,
  }: {
    origin: SiteOrigin;
    /** A short remark shown after the origin, e.g. "from fra-ressel" for a fork. */
    detail?: string;
    /** Deprecated alias of `detail`; shown as visible text, never as a tooltip only. */
    title?: string;
  } = $props();

  const extra = $derived(detail ?? title ?? '');
</script>

<span class="dl-tag origin" data-origin={origin}
  ><span class="dl-visually-hidden">Origin: </span>{ORIGIN_LABEL[origin]}{#if extra}<span
      class="detail">· {extra}</span
    >{/if}</span
>

<style>
  .origin {
    font-size: 10px;
    padding: 1px 8px;
  }
  .detail {
    text-transform: none;
    letter-spacing: 0;
    color: var(--dl-color-text-muted);
  }
</style>
