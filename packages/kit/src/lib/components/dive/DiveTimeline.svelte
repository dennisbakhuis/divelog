<script lang="ts">
  import type { DiveListItem } from '$lib/core/dive/types';
  import {
    dayAtX,
    dayScale,
    daysOfRange,
    firstDate,
    isoOfDay,
    rangeOfDays,
    today,
    xOfDate,
    xOfDay,
    yearTicks,
    type DateRange,
  } from '$lib/core/dive/timeline';
  import { formatDate, pluralize } from '$lib/core/dive/format';

  let {
    dives,
    visible,
    from = null,
    to = null,
    end = today(),
    onRange,
  }: {
    /** Every dive in the log, in any order. */
    dives: DiveListItem[];
    /** Numbers of the dives the current filter keeps; the others' marks fade. */
    visible?: Set<number>;
    /** ISO dates; null means open at that end. */
    from?: string | null;
    to?: string | null;
    /** Right end of the line; today unless a test says otherwise. */
    end?: string;
    /** Called when a handle is released or nudged; both null clears the range. */
    onRange?: (range: DateRange) => void;
  } = $props();

  const HEIGHT = 76;
  const TRACK = 42;
  const LABEL_Y = 18;
  const HANDLE_R = 7;
  const HIT = 14;

  let width = $state(960);
  let svg = $state<SVGSVGElement | null>(null);
  let drag = $state<{
    kind: 'from' | 'to' | 'band';
    grab: number;
    from: number;
    to: number;
  } | null>(null);
  let live = $state<[number, number] | null>(null);

  const start = $derived(firstDate(dives) ?? end);
  const scale = $derived(dayScale(start, end, width, 16));
  const ticks = $derived(yearTicks(scale));
  const stored = $derived(daysOfRange(scale, { from, to }));
  const days = $derived(live ?? stored);
  const fromX = $derived(xOfDay(scale, days[0]));
  const toX = $derived(xOfDay(scale, days[1]));
  const open = $derived(days[0] <= 0 && days[1] >= scale.days);
  const dimmed = $derived(visible !== undefined && visible.size !== dives.length);
  const count = $derived(visible ? visible.size : dives.length);

  const marks = $derived(
    dives.map((dive) => ({
      number: dive.number,
      x: Math.round(xOfDate(scale, dive.date) * 10) / 10,
    })),
  );

  function labelOf(day: number, edge: 'from' | 'to'): string {
    if (edge === 'to' && day >= scale.days) return 'today';
    return formatDate(isoOfDay(scale, day));
  }

  function localX(event: PointerEvent): number {
    const rect = svg?.getBoundingClientRect();
    return rect ? event.clientX - rect.left : event.offsetX;
  }

  function clampDay(day: number): number {
    return Math.min(Math.max(day, 0), scale.days);
  }

  function down(event: PointerEvent) {
    if (!onRange || event.button !== 0) return;
    const x = localX(event);
    const [a, b] = days;
    const da = Math.abs(x - fromX);
    const db = Math.abs(x - toX);
    let kind: 'from' | 'to' | 'band';
    if (da <= HIT && da < db) kind = 'from';
    else if (db <= HIT && db < da) kind = 'to';
    else if (da <= HIT && db <= HIT) kind = a <= 0 ? 'to' : 'from';
    else if (x > fromX && x < toX && !open) kind = 'band';
    else kind = da < db ? 'from' : 'to';
    drag = { kind, grab: dayAtX(scale, x), from: a, to: b };
    svg?.setPointerCapture(event.pointerId);
    apply(x);
    event.preventDefault();
  }

  function apply(x: number) {
    if (!drag) return;
    const day = dayAtX(scale, x);
    if (drag.kind === 'from') live = [Math.min(day, drag.to), drag.to];
    else if (drag.kind === 'to') live = [drag.from, Math.max(day, drag.from)];
    else {
      const span = drag.to - drag.from;
      const shifted = Math.min(Math.max(drag.from + (day - drag.grab), 0), scale.days - span);
      live = [shifted, shifted + span];
    }
  }

  function move(event: PointerEvent) {
    if (drag) apply(localX(event));
  }

  function up(event: PointerEvent) {
    if (!drag) return;
    svg?.releasePointerCapture(event.pointerId);
    const [a, b] = live ?? days;
    drag = null;
    live = null;
    commit(a, b);
  }

  function cancel() {
    drag = null;
    live = null;
  }

  function commit(a: number, b: number) {
    const next = rangeOfDays(scale, a, b);
    if (next.from === from && next.to === to) return;
    onRange?.(next);
  }

  function nudge(event: KeyboardEvent, edge: 'from' | 'to') {
    if (!onRange) return;
    const [a, b] = days;
    const current = edge === 'from' ? a : b;
    const step = event.shiftKey ? 30 : 1;
    let next: number | null = null;
    if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') next = current - step;
    else if (event.key === 'ArrowRight' || event.key === 'ArrowUp') next = current + step;
    else if (event.key === 'PageDown') next = current - 365;
    else if (event.key === 'PageUp') next = current + 365;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = scale.days;
    if (next === null) return;
    event.preventDefault();
    next = clampDay(next);
    if (edge === 'from') commit(Math.min(next, b), b);
    else commit(a, Math.max(next, a));
  }

  const summary = $derived(
    dives.length
      ? `${pluralize(dives.length, 'dive')} between ${formatDate(start)} and today`
      : 'No dives yet',
  );
</script>

<div class="timeline" bind:clientWidth={width}>
  <div class="strip" class:dragging={drag !== null}>
    <svg
      bind:this={svg}
      viewBox="0 0 {width} {HEIGHT}"
      {width}
      height={HEIGHT}
      role="group"
      aria-label={summary}
      onpointerdown={down}
      onpointermove={move}
      onpointerup={up}
      onpointercancel={cancel}
    >
      <line class="track" x1={scale.pad} x2={width - scale.pad} y1={TRACK} y2={TRACK} />

      {#each marks as mark (mark.number)}
        <line
          class="mark"
          class:dim={dimmed && !visible?.has(mark.number)}
          x1={mark.x}
          x2={mark.x}
          y1={TRACK - 5}
          y2={TRACK + 5}
        />
      {/each}

      {#each ticks as tick (tick.year)}
        <line
          class="tick"
          x1={tick.x}
          x2={tick.x}
          y1={TRACK + 9}
          y2={TRACK + (tick.labelled ? 15 : 12)}
        />
        {#if tick.labelled}
          <text class="year dl-num" x={tick.x} y={HEIGHT - 6} text-anchor="middle">{tick.year}</text
          >
        {/if}
      {/each}

      {#if !open}
        <line class="band" x1={fromX} x2={toX} y1={TRACK} y2={TRACK} />
      {/if}

      <line class="stem" x1={fromX} x2={fromX} y1={LABEL_Y + 5} y2={TRACK} />
      <line class="stem" x1={toX} x2={toX} y1={LABEL_Y + 5} y2={TRACK} />

      <text
        class="label dl-num"
        class:hot={drag?.kind === 'from' || drag?.kind === 'band'}
        x={fromX >= 110 ? fromX - 10 : fromX + 10}
        y={LABEL_Y}
        text-anchor={fromX >= 110 ? 'end' : 'start'}>{labelOf(days[0], 'from')}</text
      >
      <text
        class="label dl-num"
        class:hot={drag?.kind === 'to' || drag?.kind === 'band'}
        x={toX <= width - 110 ? toX + 10 : toX - 10}
        y={LABEL_Y}
        text-anchor={toX <= width - 110 ? 'start' : 'end'}>{labelOf(days[1], 'to')}</text
      >

      <circle
        class="handle"
        class:hot={drag?.kind === 'from' || drag?.kind === 'band'}
        cx={fromX}
        cy={TRACK}
        r={HANDLE_R}
        role="slider"
        tabindex={onRange ? 0 : -1}
        aria-label="Start of the period"
        aria-valuemin={0}
        aria-valuemax={scale.days}
        aria-valuenow={days[0]}
        aria-valuetext={labelOf(days[0], 'from')}
        onkeydown={(e) => nudge(e, 'from')}
      />
      <circle
        class="handle"
        class:hot={drag?.kind === 'to' || drag?.kind === 'band'}
        cx={toX}
        cy={TRACK}
        r={HANDLE_R}
        role="slider"
        tabindex={onRange ? 0 : -1}
        aria-label="End of the period"
        aria-valuemin={0}
        aria-valuemax={scale.days}
        aria-valuenow={days[1]}
        aria-valuetext={labelOf(days[1], 'to')}
        onkeydown={(e) => nudge(e, 'to')}
      />
    </svg>
  </div>

  <p class="hint">
    {#if from !== null || to !== null}
      <strong>{count} of {dives.length}</strong> dives between {formatDate(from ?? start)} and
      {to ? formatDate(to) : 'today'}.
      {#if onRange}
        <button type="button" class="link" onclick={() => onRange?.({ from: null, to: null })}
          >Show all years</button
        >
      {/if}
    {:else if dimmed}
      <strong>{count} of {dives.length}</strong> dives match the filters below. Drag the handles to narrow
      the period; the globe and the log follow.
    {:else}
      Each tick is a dive. Drag the handles, or the band between them, to pick a period; the globe
      and the log follow.
    {/if}
  </p>
</div>

<style>
  .timeline {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .strip {
    position: relative;
    border-radius: var(--dl-radius-md);
    background: var(--dl-color-surface);
    border: 1px solid var(--dl-color-border);
    overflow: hidden;
  }
  .strip.dragging {
    cursor: ew-resize;
  }
  svg {
    display: block;
    width: 100%;
    height: auto;
    touch-action: pan-y;
    user-select: none;
    cursor: pointer;
  }
  .track {
    stroke: var(--dl-color-border-strong);
    stroke-width: 2;
    stroke-linecap: round;
  }
  .band {
    stroke: var(--dl-color-accent);
    stroke-width: 4;
    stroke-linecap: round;
  }
  .mark {
    stroke: var(--dl-color-accent);
    stroke-width: 1;
    opacity: 0.55;
    transition: opacity 160ms ease;
  }
  .mark.dim {
    opacity: 0.12;
  }
  .tick {
    stroke: var(--dl-color-text-faint);
    stroke-width: 1;
  }
  .year {
    font-size: 11px;
    fill: var(--dl-color-text-faint);
  }
  .stem {
    stroke: var(--dl-color-border-strong);
    stroke-width: 1;
    stroke-dasharray: 2 2;
  }
  .label {
    font-size: 11.5px;
    fill: var(--dl-color-text-muted);
  }
  .label.hot {
    fill: var(--dl-color-text);
  }
  .handle {
    fill: var(--dl-color-bg-elevated);
    stroke: var(--dl-color-accent);
    stroke-width: 2;
    cursor: ew-resize;
    outline: none;
    transition:
      r 120ms ease,
      fill 120ms ease;
  }
  .handle:hover,
  .handle.hot {
    fill: var(--dl-color-accent);
    r: 8;
  }
  .handle:focus-visible {
    stroke: var(--dl-color-focus-ring);
    stroke-width: 3;
  }
  .hint {
    margin: 0;
    font-size: 13px;
    color: var(--dl-color-text-muted);
  }
  .hint strong {
    color: var(--dl-color-text);
    font-weight: 500;
  }
  .link {
    background: none;
    border: 0;
    padding: 0;
    font: inherit;
    color: var(--dl-color-link);
    cursor: pointer;
    text-decoration: underline;
  }
  @media (prefers-reduced-motion: reduce) {
    .mark,
    .handle {
      transition: none;
    }
  }
</style>
