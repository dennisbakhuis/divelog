<script lang="ts">
  import { onMount } from 'svelte';
  import type { ProfileMeta, ProfileSample } from '$lib/core/dive/types';
  import {
    ceilingSteps,
    clock,
    decoSpans,
    gasSwitches,
    profileFacts,
    sampleAt,
  } from '$lib/core/dive/profile-view';
  import { reducedMotion } from '$lib/components/anim/motion';

  let {
    samples,
    maxDepth,
    meta = null,
    avgDepth = null,
  }: {
    samples: ProfileSample[];
    maxDepth: number;
    meta?: ProfileMeta | null;
    avgDepth?: number | null;
  } = $props();

  const W = 800;
  const H = 260;
  const PAD = { l: 40, r: 44, t: 18, b: 28 };

  const tMax = $derived(Math.max(...samples.map((s) => s.t), 1));
  const dMax = $derived(Math.max(maxDepth, ...samples.map((s) => s.d)) * 1.08);
  const temps = $derived(
    samples.filter((s) => typeof s.temp === 'number') as (ProfileSample & { temp: number })[],
  );
  const tempRange = $derived(
    temps.length
      ? [Math.min(...temps.map((s) => s.temp)) - 1, Math.max(...temps.map((s) => s.temp)) + 1]
      : [0, 1],
  );

  const x = (t: number) => PAD.l + (t / tMax) * (W - PAD.l - PAD.r);
  const y = (d: number) => PAD.t + (d / dMax) * (H - PAD.t - PAD.b);
  const yTemp = (temp: number) =>
    PAD.t + (1 - (temp - tempRange[0]) / (tempRange[1] - tempRange[0] || 1)) * (H - PAD.t - PAD.b);

  function linePath(points: ProfileSample[]): string {
    return points
      .map((s, i) => `${i ? 'L' : 'M'}${x(s.t).toFixed(1)} ${y(s.d).toFixed(1)}`)
      .join(' ');
  }

  const depthPath = $derived(linePath(samples));
  const areaPath = $derived(
    `${depthPath} L${x(samples[samples.length - 1].t).toFixed(1)} ${y(0)} L${x(samples[0].t).toFixed(1)} ${y(0)} Z`,
  );
  const tempPath = $derived(
    temps
      .map((s, i) => `${i ? 'L' : 'M'}${x(s.t).toFixed(1)} ${yTemp(s.temp).toFixed(1)}`)
      .join(' '),
  );

  const ceiling = $derived(ceilingSteps(samples));
  const ceilingArea = $derived(
    ceiling
      .map(
        (c) =>
          `M${x(c.from).toFixed(1)} ${y(0)} L${x(c.from).toFixed(1)} ${y(c.depth).toFixed(1)} L${x(c.to).toFixed(1)} ${y(c.depth).toFixed(1)} L${x(c.to).toFixed(1)} ${y(0)} Z`,
      )
      .join(' '),
  );
  const ceilingEdge = $derived(
    ceiling
      .map(
        (c) =>
          `M${x(c.from).toFixed(1)} ${y(c.depth).toFixed(1)} L${x(c.to).toFixed(1)} ${y(c.depth).toFixed(1)}`,
      )
      .join(' '),
  );
  const decoPaths = $derived(
    decoSpans(samples).map((span) =>
      linePath(samples.filter((s) => s.t >= span.from && s.t <= span.to)),
    ),
  );
  const switches = $derived(
    gasSwitches(meta).map((s) => ({ ...s, x: x(s.t), depth: sampleAt(samples, s.t)?.d ?? 0 })),
  );
  const breaks = $derived(
    (meta?.surface_breaks ?? [])
      .filter((b) => b.length === 2 && b[1] > b[0])
      .map(([from, to]) => ({ from, to, x0: x(from), x1: x(to) })),
  );
  const facts = $derived(profileFacts(meta, avgDepth));

  const depthTicks = $derived([0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(f * dMax)));
  const timeTicks = $derived(Array.from({ length: 6 }, (_, i) => Math.round((i / 5) * tMax)));

  let svg = $state<SVGSVGElement>();
  let hovered = $state<ProfileSample | null>(null);

  function probe(event: PointerEvent) {
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const view = ((event.clientX - rect.left) / rect.width) * W;
    const t = ((view - PAD.l) / (W - PAD.l - PAD.r)) * tMax;
    hovered = sampleAt(samples, Math.min(Math.max(t, 0), tMax));
  }

  const readoutLeft = $derived(hovered ? (x(hovered.t) / W) * 100 : 0);
  const readoutFlip = $derived(readoutLeft > 62);

  let pathEl = $state<SVGPathElement>();
  let areaEl = $state<SVGPathElement>();

  onMount(() => {
    if (reducedMotion() || !pathEl || !areaEl) return;
    const length = pathEl.getTotalLength();
    pathEl.style.strokeDasharray = `${length}`;
    pathEl.style.strokeDashoffset = `${length}`;
    areaEl.style.opacity = '0';
    void import('animejs').then(({ animate }) => {
      animate(pathEl!, { strokeDashoffset: [length, 0], duration: 1800, ease: 'inOutSine' });
      animate(areaEl!, { opacity: [0, 1], duration: 900, delay: 1200, ease: 'outQuad' });
    });
  });
</script>

<figure class="profile dl-card">
  <div class="stage">
    <svg
      bind:this={svg}
      viewBox="0 0 {W} {H}"
      role="img"
      aria-label="Depth profile: {maxDepth} metres maximum over {Math.round(tMax / 60)} minutes"
      onpointermove={probe}
      onpointerdown={probe}
      onpointerleave={() => (hovered = null)}
    >
      {#each depthTicks as tick (tick)}
        <line x1={PAD.l} x2={W - PAD.r} y1={y(tick)} y2={y(tick)} class="grid" />
        <text x={PAD.l - 6} y={y(tick) + 4} class="axis" text-anchor="end">{tick} m</text>
      {/each}
      {#each timeTicks as tick (tick)}
        <text x={x(tick)} y={H - 8} class="axis" text-anchor="middle">{Math.round(tick / 60)}′</text
        >
      {/each}

      {#each breaks as b (b.from)}
        <rect
          class="break"
          x={b.x0}
          y={PAD.t}
          width={Math.max(b.x1 - b.x0, 1)}
          height={H - PAD.t - PAD.b}
        />
        <text x={(b.x0 + b.x1) / 2} y={PAD.t + 12} class="axis break-label" text-anchor="middle"
          >surface</text
        >
      {/each}

      {#if ceiling.length}
        <path d={ceilingArea} class="ceiling" />
        <path d={ceilingEdge} class="ceiling-edge" />
      {/if}

      <path d={areaPath} class="area" bind:this={areaEl} />
      <path d={depthPath} class="line" bind:this={pathEl} />
      {#each decoPaths as d, i (i)}
        <path {d} class="deco" />
      {/each}

      {#if temps.length > 1}
        <path d={tempPath} class="temp" />
        <text x={W - PAD.r + 6} y={yTemp(tempRange[1] - 1) + 4} class="axis temp-label"
          >{Math.round(tempRange[1] - 1)} °C</text
        >
        <text x={W - PAD.r + 6} y={yTemp(tempRange[0] + 1) + 4} class="axis temp-label"
          >{Math.round(tempRange[0] + 1)} °C</text
        >
      {/if}

      {#each switches as s (s.t)}
        <line class="switch" x1={s.x} x2={s.x} y1={PAD.t} y2={y(s.depth)} />
        <circle class="switch-dot" cx={s.x} cy={y(s.depth)} r="4" />
        <text class="axis switch-label" x={s.x} y={PAD.t - 5} text-anchor="middle">{s.label}</text>
      {/each}

      {#if hovered}
        <line class="cursor" x1={x(hovered.t)} x2={x(hovered.t)} y1={PAD.t} y2={H - PAD.b} />
        <circle class="cursor-dot" cx={x(hovered.t)} cy={y(hovered.d)} r="4.5" />
      {/if}
    </svg>

    <div
      class="readout dl-num"
      class:visible={hovered}
      class:flip={readoutFlip}
      style="left: {readoutLeft}%"
      aria-live="polite"
    >
      {#if hovered}
        <strong>{clock(hovered.t)} · {hovered.d.toFixed(1)} m</strong>
        {#if typeof hovered.temp === 'number'}<span>{hovered.temp} °C</span>{/if}
        {#if hovered.stop}
          <span class="warm">ceiling {hovered.stop} m</span>
        {:else if typeof hovered.ndl === 'number'}
          <span>NDL {hovered.ndl >= 99 ? '99+' : hovered.ndl} min</span>
        {/if}
        {#if typeof hovered.tts === 'number' && hovered.tts > 0}<span>TTS {hovered.tts} min</span
          >{/if}
      {/if}
    </div>
  </div>

  {#if facts.length}
    <dl class="facts">
      {#each facts as fact (fact.label)}
        <div>
          <dt>{fact.label}</dt>
          <dd class="dl-num">{fact.value}</dd>
          {#if fact.note}<dd class="note">{fact.note}</dd>{/if}
        </div>
      {/each}
    </dl>
  {/if}

  <figcaption>
    <span><i class="sw depth"></i> depth</span>
    {#if temps.length > 1}<span><i class="sw temp"></i> water temperature</span>{/if}
    {#if ceiling.length}<span><i class="sw ceiling"></i> deco ceiling</span>{/if}
    {#if decoPaths.length}<span><i class="sw deco"></i> in deco</span>{/if}
    {#if switches.length}<span><i class="sw switch"></i> gas switch</span>{/if}
    <span class="how">hover or touch the chart for the computer's readout</span>
  </figcaption>
</figure>

<style>
  .profile {
    margin: 0;
    padding: 16px 12px 12px;
    background: var(--dl-color-bg-elevated);
  }
  .stage {
    position: relative;
  }
  svg {
    width: 100%;
    height: auto;
    display: block;
    touch-action: pan-y;
    cursor: crosshair;
  }
  .grid {
    stroke: var(--dl-color-border);
    stroke-dasharray: 2 4;
  }
  .axis {
    fill: var(--dl-color-text-faint);
    font-family: var(--dl-font-mono);
    font-size: 11px;
  }
  .area {
    fill: color-mix(in srgb, var(--dl-color-accent) 18%, transparent);
  }
  .line {
    fill: none;
    stroke: var(--dl-color-accent);
    stroke-width: 2.2;
    stroke-linejoin: round;
    stroke-linecap: round;
  }
  .deco {
    fill: none;
    stroke: var(--dl-color-error);
    stroke-width: 2.6;
    stroke-linejoin: round;
    stroke-linecap: round;
  }
  .ceiling {
    fill: color-mix(in srgb, var(--dl-color-error) 16%, transparent);
  }
  .ceiling-edge {
    fill: none;
    stroke: var(--dl-color-error);
    stroke-width: 1.2;
    stroke-dasharray: 3 3;
  }
  .break {
    fill: color-mix(in srgb, var(--dl-color-text) 5%, transparent);
  }
  .break-label {
    fill: var(--dl-color-text-faint);
    font-size: 10px;
  }
  .temp {
    fill: none;
    stroke: var(--dl-color-warm);
    stroke-width: 1.4;
    stroke-dasharray: 4 3;
    opacity: 0.85;
  }
  .temp-label {
    fill: var(--dl-color-warm);
  }
  .switch {
    stroke: var(--dl-color-success);
    stroke-width: 1;
    stroke-dasharray: 2 3;
  }
  .switch-dot {
    fill: var(--dl-color-success);
    stroke: var(--dl-color-bg-elevated);
    stroke-width: 1.5;
  }
  .switch-label {
    fill: var(--dl-color-success);
    font-size: 10.5px;
  }
  .cursor {
    stroke: var(--dl-color-text-muted);
    stroke-width: 1;
  }
  .cursor-dot {
    fill: var(--dl-color-text);
    stroke: var(--dl-color-bg-elevated);
    stroke-width: 1.5;
  }
  .readout {
    position: absolute;
    top: 8px;
    transform: translateX(12px);
    display: flex;
    flex-direction: column;
    gap: 1px;
    padding: 6px 10px;
    border-radius: var(--dl-radius-sm);
    background: color-mix(in srgb, var(--dl-color-surface) 94%, transparent);
    border: 1px solid var(--dl-color-border-strong);
    box-shadow: var(--dl-shadow-sm);
    font-size: 12px;
    color: var(--dl-color-text-muted);
    opacity: 0;
    pointer-events: none;
    transition: opacity 0.12s ease;
    white-space: nowrap;
  }
  .readout.flip {
    transform: translateX(calc(-100% - 12px));
  }
  .readout.visible {
    opacity: 1;
  }
  .readout strong {
    color: var(--dl-color-text);
    font-weight: 500;
  }
  .readout .warm {
    color: var(--dl-color-error);
  }
  figcaption {
    display: flex;
    flex-wrap: wrap;
    gap: 6px 16px;
    padding: 8px 6px 0;
    font-size: 12px;
    color: var(--dl-color-text-muted);
    font-family: var(--dl-font-mono);
  }
  .how {
    margin-left: auto;
    color: var(--dl-color-text-faint);
  }
  .sw {
    display: inline-block;
    width: 14px;
    height: 2px;
    vertical-align: middle;
    margin-right: 6px;
  }
  .sw.depth {
    background: var(--dl-color-accent);
  }
  .sw.temp {
    background: var(--dl-color-warm);
  }
  .sw.deco {
    background: var(--dl-color-error);
    height: 3px;
  }
  .sw.ceiling {
    height: 8px;
    background: color-mix(in srgb, var(--dl-color-error) 28%, transparent);
    border-bottom: 1px dashed var(--dl-color-error);
  }
  .sw.switch {
    background: var(--dl-color-success);
  }
  .facts {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(110px, 1fr));
    gap: 12px 16px;
    margin: 14px 0 0;
    padding: 12px 6px 0;
    border-top: 1px solid var(--dl-color-border);
  }
  .facts dt {
    font-family: var(--dl-font-mono);
    font-size: 10.5px;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--dl-color-text-muted);
  }
  .facts dd {
    margin: 2px 0 0;
    font-size: 17px;
    font-weight: 500;
    color: var(--dl-color-text);
  }
  .facts dd.note {
    display: block;
    margin: 0;
    font-size: 11.5px;
    font-weight: 400;
    color: var(--dl-color-text-faint);
  }
  @media (max-width: 480px) {
    .how {
      display: none;
    }
  }
</style>
