<script lang="ts">
  import { SIGNATURE_VIEWBOX, signaturePath } from '$lib/core/dive/signature';

  let {
    strokes,
    label,
    width = 240,
  }: {
    /** The note's strokes, in the 1000 × 400 signature box. */
    strokes: number[][][];
    /** Text alternative ("Signature of Alex"). */
    label: string;
    /** Widest the drawing gets, in CSS pixels; it shrinks with its container. */
    width?: number;
  } = $props();
</script>

<svg
  class="dl-signature-image"
  viewBox={SIGNATURE_VIEWBOX}
  role="img"
  aria-label={label}
  style:max-width="{width}px"
>
  <path d={signaturePath(strokes)} />
</svg>

<style>
  .dl-signature-image {
    display: block;
    width: 100%;
    height: auto;
    aspect-ratio: 1000 / 400;
    color: inherit;
  }
  path {
    fill: none;
    stroke: currentColor;
    stroke-width: 10;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
</style>
