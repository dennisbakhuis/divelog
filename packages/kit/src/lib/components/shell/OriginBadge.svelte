<script lang="ts">
  import type { SiteOrigin } from '$lib/core/dive/types';
  import { ORIGIN_LABEL } from '$lib/core/dive/sharing';

  let {
    origin,
    detail,
    title,
  }: {
    origin: SiteOrigin;
    /** A short remark shown as visible text after the origin, e.g. "from fra-ressel". */
    detail?: string;
    /** Deprecated: a tooltip only screen-reader and mouse users can find; pass `detail`. */
    title?: string;
  } = $props();
</script>

<span class="dl-tag origin" data-origin={origin} {title}
  >{ORIGIN_LABEL[origin]}{#if detail}<span class="detail">· {detail}</span>{/if}</span
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
