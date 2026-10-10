<script lang="ts">
  import type { Action } from 'svelte/action';
  import type { DiveSummary } from '$lib/core/dive/types';
  import { counter } from '$lib/components/anim/counter';
  import { reducedMotion } from '$lib/components/anim/motion';
  import { formatDate } from '$lib/core/dive/format';
  import { latestMatches, sparkline, type DiveTimeline } from '$lib/core/dive/sparkline';
  import { getDivelog } from '$lib/core/dive/context';

  const { urls } = getDivelog();

  let {
    summary,
    timeline = null,
    title = 'Diving',
    blurb = 'Every dive in the log, with its site, depth and time underwater.',
  }: {
    summary: DiveSummary | null;
    timeline?: DiveTimeline | null;
    /** The tile's heading. */
    title?: string;
    /** One or two sentences under the heading; empty hides the paragraph. */
    blurb?: string;
  } = $props();

  const SPARK_W = 320;
  const SPARK_H = 44;
  const years = $derived(timeline?.years ?? []);
  const spark = $derived(sparkline(years, SPARK_W, SPARK_H, 3));
  const lastDiveHref = $derived(
    timeline?.latest && latestMatches(timeline, summary?.last_dive ?? null)
      ? urls.dive(timeline.latest.number)
      : null,
  );
  const sparkLabel = $derived(
    years.length && spark.peak
      ? `Dives per year, ${years[0].year} to ${years[years.length - 1].year}; busiest year ${spark.peak.year} with ${spark.peak.dives} dives.`
      : '',
  );

  // Server-rendered and reduced-motion visitors get the finished line; only
  // an animating browser hides it first and draws it in when scrolled to.
  let armed = $state(false);
  let drawn = $state(false);
  const drawOnView: Action<SVGSVGElement> = (node) => {
    if (reducedMotion()) return;
    armed = true;
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        drawn = true;
        observer.disconnect();
      },
      { threshold: 0.4 },
    );
    observer.observe(node);
    return { destroy: () => observer.disconnect() };
  };
</script>

<div class="tile">
  <div class="tile-head">
    <span class="tile-title">{title}</span>
    <a class="tile-link" href={urls.log()}>Open the log →</a>
  </div>
  {#if blurb}
    <p class="tile-blurb">{blurb}</p>
  {/if}
  {#if summary}
    {#snippet stat(label: string, value: number, text: string, decimals = 0, suffix = '')}
      <div>
        <dt>{label}</dt>
        <dd class="dl-num">
          <span aria-hidden="true" use:counter={{ value, decimals, suffix }}>{text}</span><span
            class="dl-visually-hidden">{text}</span
          >
        </dd>
      </div>
    {/snippet}
    <dl class="stats">
      {@render stat('Dives', summary.total_dives, String(summary.total_dives))}
      {@render stat('Hours down', summary.total_hours, String(summary.total_hours))}
      {@render stat('Deepest', summary.max_depth_m, `${summary.max_depth_m} m`, 0, ' m')}
      {@render stat('Countries', summary.countries, String(summary.countries))}
      {@render stat('Cave dives', summary.cave_dives, String(summary.cave_dives))}
      {@render stat('Scooter dives', summary.scooter_dives, String(summary.scooter_dives))}
    </dl>
    {#if spark.line}
      <figure class="spark">
        <svg
          viewBox="0 0 {SPARK_W} {SPARK_H}"
          role="img"
          aria-label={sparkLabel}
          class:armed
          class:drawn
          use:drawOnView
        >
          <path class="spark-area" d={spark.area} />
          <path class="spark-line" d={spark.line} pathLength="1" />
          {#if spark.last}
            <circle class="spark-dot" cx={spark.last.x} cy={spark.last.y} r="3" />
          {/if}
        </svg>
        <figcaption class="dl-num">
          <span>{years[0].year}</span>
          <span class="spark-caption">dives per year</span>
          <span>{years[years.length - 1].year}</span>
        </figcaption>
      </figure>
    {/if}
    {#if summary.last_dive}
      <p class="last-dive dl-num">
        Last dive:
        {#if lastDiveHref}
          <a href={lastDiveHref}
            >{formatDate(summary.last_dive)}{summary.last_dive_site
              ? ` · ${summary.last_dive_site}`
              : ''}</a
          >
        {:else}
          {formatDate(summary.last_dive)}{summary.last_dive_site
            ? ` · ${summary.last_dive_site}`
            : ''}
        {/if}
      </p>
    {/if}
  {:else}
    <p class="tile-blurb muted">
      The dive log is taking a surface interval — try again in a moment.
    </p>
  {/if}
</div>

<style>
  .tile {
    position: relative;
    display: flex;
    flex-direction: column;
    height: 100%;
    color: inherit;
  }
  .tile-head {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 12px;
    margin-bottom: 8px;
  }
  .tile-title {
    font-family: var(--dl-font-display);
    font-size: 22px;
    font-weight: 600;
  }
  .tile-link {
    font-size: 13px;
    opacity: 0.7;
    font-family: var(--dl-font-mono);
    color: inherit;
    text-decoration: none;
  }
  .tile-link::after {
    content: '';
    position: absolute;
    inset: 0;
  }
  .tile:hover .tile-link {
    opacity: 1;
    color: var(--dl-color-accent);
  }
  .tile-blurb {
    opacity: 0.8;
    font-size: 15px;
    line-height: 1.5;
    max-width: 44ch;
  }
  .muted {
    opacity: 0.5;
  }
  .stats {
    margin: auto 0 0;
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 18px 12px;
  }
  .stats dt {
    font-family: var(--dl-font-mono);
    font-size: 11px;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    opacity: 0.65;
  }
  .spark {
    margin: 22px 0 0;
  }
  .spark svg {
    display: block;
    width: 100%;
    height: auto;
    overflow: visible;
  }
  .spark-area {
    fill: var(--dl-color-accent-soft);
  }
  .spark-line {
    fill: none;
    stroke: var(--dl-color-accent);
    stroke-width: 1.5;
    stroke-linejoin: round;
    stroke-linecap: round;
    stroke-dasharray: 1;
    stroke-dashoffset: 0;
  }
  .spark-dot {
    fill: var(--dl-color-warm);
  }
  .spark svg.armed .spark-line {
    stroke-dashoffset: 1;
  }
  .spark svg.armed .spark-area,
  .spark svg.armed .spark-dot {
    opacity: 0;
  }
  .spark svg.armed.drawn .spark-line {
    stroke-dashoffset: 0;
    transition: stroke-dashoffset 1.4s cubic-bezier(0.33, 1, 0.68, 1);
  }
  .spark svg.armed.drawn .spark-area,
  .spark svg.armed.drawn .spark-dot {
    opacity: 1;
    transition: opacity 0.6s ease 1s;
  }
  @media (prefers-reduced-motion: reduce) {
    .spark svg.armed .spark-line,
    .spark svg.armed .spark-area,
    .spark svg.armed .spark-dot {
      stroke-dashoffset: 0;
      opacity: 1;
      transition: none;
    }
  }
  .spark figcaption {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    margin-top: 6px;
    font-family: var(--dl-font-mono);
    font-size: 11px;
    letter-spacing: 0.08em;
    opacity: 0.6;
  }
  .spark-caption {
    text-transform: uppercase;
    letter-spacing: 0.12em;
  }
  .last-dive {
    margin: 14px 0 0;
    font-family: var(--dl-font-mono);
    font-size: 13px;
    opacity: 0.75;
  }
  .last-dive a {
    position: relative;
    z-index: 1;
    color: inherit;
    text-decoration: underline;
    text-decoration-color: color-mix(in srgb, currentColor 40%, transparent);
    text-underline-offset: 3px;
  }
  .last-dive a:hover {
    color: var(--dl-color-accent);
  }
  .stats dd {
    margin: 2px 0 0;
    font-size: clamp(26px, 3vw, 36px);
    font-weight: 500;
    line-height: 1;
  }
</style>
