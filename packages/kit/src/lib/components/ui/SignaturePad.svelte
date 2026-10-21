<script lang="ts">
  import {
    SIGNATURE_BOX,
    SIGNATURE_LIMITS,
    SIGNATURE_VIEWBOX,
    clampToBox,
    pointCount,
    signaturePath,
    simplifyStroke,
  } from '$lib/core/dive/signature.js';

  let {
    value = $bindable([]),
    onchange,
    label,
    description = 'Draw with a finger, a pen or the mouse.',
    disabled = false,
  }: {
    /** The strokes drawn so far: polylines of integer points in the 1000 × 400 box. */
    value?: number[][][];
    /** Called with the new strokes after a stroke ends, on Undo and on Clear. */
    onchange?: (value: number[][][]) => void;
    /** Accessible name of the drawing area ("Your signature"). */
    label: string;
    /** How to draw, read with the label and shown under the pad. */
    description?: string;
    disabled?: boolean;
  } = $props();

  const propsId = $props.id();
  const uid = `dl-signature-${propsId}`;
  const descriptionId = `${uid}-description`;

  let svg = $state<SVGSVGElement>();
  let tools = $state<HTMLElement>();
  let current = $state<number[][] | null>(null);
  let pointerId: number | null = null;

  const used = $derived(pointCount(value));
  const full = $derived(
    value.length >= SIGNATURE_LIMITS.strokes || used >= SIGNATURE_LIMITS.points,
  );
  const path = $derived(signaturePath(current ? [...value, current] : value));
  const status = $derived(
    disabled
      ? 'Drawing is off.'
      : full
        ? 'The pad is full; undo or clear to draw more.'
        : value.length === 0
          ? 'Nothing drawn yet.'
          : `${value.length} ${value.length === 1 ? 'stroke' : 'strokes'} drawn.`,
  );

  function pointOf(e: PointerEvent): number[] {
    const rect = svg?.getBoundingClientRect();
    if (!rect || !rect.width || !rect.height) return clampToBox(0, 0);
    return clampToBox(
      ((e.clientX - rect.left) / rect.width) * SIGNATURE_BOX.width,
      ((e.clientY - rect.top) / rect.height) * SIGNATURE_BOX.height,
    );
  }

  function commit(next: number[][][]) {
    value = next;
    onchange?.(next);
  }

  function onpointerdown(e: PointerEvent) {
    if (disabled || full || pointerId !== null) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    e.preventDefault();
    pointerId = e.pointerId;
    current = [pointOf(e)];
    try {
      svg?.setPointerCapture?.(e.pointerId);
    } catch {
      // the pointer is already gone; the stroke ends on pointerup as usual
    }
  }

  function onpointermove(e: PointerEvent) {
    if (e.pointerId !== pointerId || !current) return;
    e.preventDefault();
    const coalesced = e.getCoalescedEvents?.() ?? [];
    const points = [...current];
    for (const event of coalesced.length ? coalesced : [e]) {
      if (used + points.length >= SIGNATURE_LIMITS.points) break;
      const point = pointOf(event);
      const last = points[points.length - 1];
      if (point[0] !== last[0] || point[1] !== last[1]) points.push(point);
    }
    current = points;
  }

  function onpointerend(e: PointerEvent) {
    if (e.pointerId !== pointerId || !current) return;
    const drawn = current;
    pointerId = null;
    current = null;
    const stroke = simplifyStroke(drawn.length === 1 ? [drawn[0], drawn[0]] : drawn);
    const room = SIGNATURE_LIMITS.points - used;
    if (room > 0) commit([...value, stroke.slice(0, room)]);
  }

  /** Both tools switch off on an empty pad; focus moves to the pad so a keyboard user keeps their place. */
  function keepFocus() {
    if (value.length === 0 && tools?.contains(document.activeElement)) svg?.focus();
  }

  function undo() {
    if (!value.length) return;
    commit(value.slice(0, -1));
    keepFocus();
  }

  function clear() {
    if (!value.length) return;
    commit([]);
    keepFocus();
  }
</script>

<div class="dl-signature" class:disabled>
  <svg
    bind:this={svg}
    class="dl-signature-pad"
    viewBox={SIGNATURE_VIEWBOX}
    role="img"
    aria-label={label}
    aria-describedby={descriptionId}
    tabindex="-1"
    {onpointerdown}
    {onpointermove}
    onpointerup={onpointerend}
    onpointercancel={onpointerend}
  >
    <line
      class="dl-signature-baseline"
      x1="40"
      x2={SIGNATURE_BOX.width - 40}
      y1={SIGNATURE_BOX.height * 0.75}
      y2={SIGNATURE_BOX.height * 0.75}
    />
    <path class="dl-signature-ink" d={path} />
  </svg>
  <div class="dl-signature-foot">
    <p class="dl-signature-hint" id={descriptionId}>{description} {status}</p>
    <div class="dl-signature-tools" bind:this={tools}>
      <button
        type="button"
        class="dl-btn dl-btn-ghost dl-btn-sm"
        disabled={disabled || value.length === 0}
        onclick={undo}>Undo</button
      >
      <button
        type="button"
        class="dl-btn dl-btn-ghost dl-btn-sm"
        disabled={disabled || value.length === 0}
        onclick={clear}>Clear</button
      >
    </div>
  </div>
</div>

<style>
  .dl-signature {
    display: flex;
    flex-direction: column;
    gap: 8px;
    width: 100%;
  }
  .dl-signature-pad {
    display: block;
    width: 100%;
    height: auto;
    aspect-ratio: 1000 / 400;
    touch-action: none;
    user-select: none;
    -webkit-user-select: none;
    -webkit-touch-callout: none;
    cursor: crosshair;
    color: var(--dl-color-text);
    background: var(--dl-color-surface);
    border: 1px dashed var(--dl-color-border-control);
    border-radius: 10px;
  }
  .disabled .dl-signature-pad {
    cursor: not-allowed;
    opacity: 0.6;
  }
  .dl-signature-baseline {
    stroke: var(--dl-color-border-strong);
    stroke-width: 2;
    stroke-dasharray: 8 10;
  }
  .dl-signature-ink {
    fill: none;
    stroke: currentColor;
    stroke-width: 8;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
  .dl-signature-foot {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }
  .dl-signature-hint {
    margin: 0;
    font-size: 13px;
    color: var(--dl-color-text-faint);
  }
  .dl-signature-tools {
    display: flex;
    gap: 8px;
  }
  @media (pointer: coarse) {
    .dl-signature-tools .dl-btn {
      min-height: var(--dl-tap-min, 44px);
      min-width: var(--dl-tap-min, 44px);
    }
  }
</style>
