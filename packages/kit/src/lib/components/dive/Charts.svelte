<script lang="ts">
  import type { DiveListItem } from '$lib/core/dive/types';
  import { toggleTag, type DiveFilter } from '$lib/core/dive/filter';
  import {
    axisYears,
    bandActive,
    bands,
    countRows,
    cumulativeHours,
    DEPTH_EDGES,
    DURATION_EDGES,
    gridLines,
    linePath,
    rhythmTiles,
    tagRows,
    tempColour,
    toggleDepthBand,
    toggleDurationBand,
    toggleOne,
    toggleYear,
    waterByCountry,
    yearActive,
    yearBars,
  } from '$lib/core/dive/charts-view';
  import { flagEmoji, formatHours } from '$lib/core/dive/format';
  import { today } from '$lib/core/dive/timeline';
  import { counter } from '$lib/components/anim/counter';
  import { inView } from '$lib/components/anim/inview';

  let {
    dives,
    selected,
    filter,
    onChange,
  }: {
    /** The whole log, drawn faint behind the selection. */
    dives: DiveListItem[];
    /** The dives the current filter keeps; equal to `dives` when nothing narrows it. */
    selected: DiveListItem[];
    filter: DiveFilter;
    onChange: (next: DiveFilter) => void;
  } = $props();

  const narrowed = $derived(selected.length !== dives.length);

  function pct(value: number, max: number): number {
    return Math.round((value / Math.max(max, 1)) * 100);
  }

  const years = $derived(yearBars(dives, selected));
  const yearMax = $derived(Math.max(...years.map((y) => y.total), 1));

  const depths = $derived(bands(dives, selected, DEPTH_EDGES, (d) => d.max_depth_m));
  const depthMax = $derived(Math.max(...depths.map((b) => b.total), 1));
  const durations = $derived(bands(dives, selected, DURATION_EDGES, (d) => d.duration_min));
  const durationMax = $derived(Math.max(...durations.map((b) => b.total), 1));

  const tags = $derived(tagRows(dives, selected, 8));
  const tagMax = $derived(Math.max(...tags.map((t) => t.total), 1));
  const sites = $derived(countRows(dives, selected, (d) => (d.site ? [d.site] : []), 8));
  const siteMax = $derived(Math.max(...sites.map((s) => s.total), 1));
  const people = $derived(countRows(dives, selected, (d) => d.buddies, 8));
  const peopleMax = $derived(Math.max(...people.map((p) => p.total), 1));

  const water = $derived(waterByCountry(dives, selected));
  const waterLo = $derived(Math.min(...water.map((w) => w.min), 30));
  const waterHi = $derived(Math.max(...water.map((w) => w.max), waterLo + 1));
  function tempX(celsius: number): number {
    return 3 + ((celsius - waterLo) / (waterHi - waterLo)) * 94;
  }

  const rhythm = $derived(rhythmTiles(selected, today()));

  // The cumulative curve: the whole log as a faint ghost, the selection solid.
  const W = 340;
  const H = 150;
  const PAD = { l: 36, r: 40, t: 14, b: 20 };
  const cumulative = $derived(cumulativeHours(years));
  const cumMax = $derived(Math.max(cumulative[cumulative.length - 1]?.hours ?? 0, 1));
  function cx(i: number): number {
    const n = Math.max(cumulative.length - 1, 1);
    return PAD.l + (i / n) * (W - PAD.l - PAD.r);
  }
  function cy(hours: number): number {
    return PAD.t + (1 - hours / cumMax) * (H - PAD.t - PAD.b);
  }
  const ghostPath = $derived(
    linePath(
      cumulative.map((p, i) => ({ x: cx(i), y: cy(p.hours) })),
      H - PAD.b,
    ),
  );
  const solidPath = $derived(
    linePath(
      cumulative.map((p, i) => ({ x: cx(i), y: cy(p.selectedHours) })),
      H - PAD.b,
    ),
  );
  const grid = $derived(gridLines(cumMax));
  const axis = $derived(axisYears(cumulative.map((p) => p.year)));

  let hovered: number | null = $state(null);
  const probe = (e: PointerEvent) => {
    const rect = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * W;
    const n = cumulative.length - 1;
    const i = Math.round(((x - PAD.l) / (W - PAD.l - PAD.r)) * n);
    hovered = Math.min(Math.max(i, 0), n);
  };
  const readout = $derived(cumulative[hovered ?? cumulative.length - 1] ?? null);
  const endPoint = $derived(cumulative[cumulative.length - 1] ?? null);

  function numeric(value: string): { n: number; suffix: string; decimals: number } | null {
    const m = /^([\d.]+)(.*)$/.exec(value);
    if (!m) return null;
    const n = Number(m[1]);
    if (!Number.isFinite(n)) return null;
    return { n, suffix: m[2], decimals: m[1].includes('.') ? 1 : 0 };
  }
</script>

<div class="charts">
  <div class="chart dl-card" use:inView>
    <h3>Dives per year</h3>
    <div class="bars" style="--n: {years.length}">
      {#each years as year, i (year.year)}
        <button
          type="button"
          class="bar-col"
          class:active={yearActive(filter, year.year)}
          class:empty={narrowed && !year.selected}
          style="--i: {i}"
          aria-pressed={yearActive(filter, year.year)}
          onclick={() => onChange(toggleYear(filter, year.year))}
        >
          <span class="dl-visually-hidden"
            >{year.year}: {year.total} dives, {formatHours(year.minutes)}{narrowed
              ? `, ${year.selected} selected`
              : ''}</span
          >
          <span class="bar-stack" aria-hidden="true">
            <span class="bar-value dl-num" style="bottom: {pct(year.selected, yearMax)}%"
              >{narrowed && !year.selected ? '' : year.selected}</span
            >
            {#if narrowed}<span class="bar ghost" style="height: {pct(year.total, yearMax)}%"
              ></span>{/if}
            <span class="bar" style="height: {pct(year.selected, yearMax)}%"></span>
          </span>
          <span class="bar-label dl-num" aria-hidden="true">{String(year.year).slice(2)}</span>
        </button>
      {/each}
    </div>
  </div>

  <div class="chart dl-card" use:inView>
    <h3>Hours underwater, cumulative</h3>
    {#if cumulative.length > 1}
      <svg
        viewBox="0 0 {W} {H}"
        class="area-chart"
        role="img"
        aria-label="Cumulative bottom time, {Math.round(cumMax)} hours by {endPoint?.year}"
        onpointermove={probe}
        onpointerdown={probe}
        onpointerleave={() => (hovered = null)}
      >
        {#each grid as hours (hours)}
          <line x1={PAD.l} x2={W - PAD.r} y1={cy(hours)} y2={cy(hours)} class="grid" />
          <text x={PAD.l - 6} y={cy(hours) + 3} text-anchor="end" class="axis dl-num"
            >{hours} h</text
          >
        {/each}
        <line x1={PAD.l} x2={W - PAD.r} y1={H - PAD.b} y2={H - PAD.b} class="grid base" />
        {#if narrowed}
          <path d={ghostPath.area} class="cum-area ghost" />
          <path d={ghostPath.line} class="cum-line ghost" />
        {/if}
        <path d={solidPath.area} class="cum-area" />
        <path d={solidPath.line} class="cum-line" pathLength="1" />
        {#each axis as year (year)}
          <text x={cx(year - cumulative[0].year)} y={H - 6} text-anchor="middle" class="axis dl-num"
            >{year}</text
          >
        {/each}
        {#if readout}
          {@const i = cumulative.indexOf(readout)}
          <line x1={cx(i)} x2={cx(i)} y1={PAD.t} y2={H - PAD.b} class="cursor" />
          <circle cx={cx(i)} cy={cy(readout.selectedHours)} r="3.5" class="dot" />
        {/if}
        {#if endPoint}
          <text x={W - PAD.r + 6} y={cy(endPoint.selectedHours) + 3} class="end dl-num"
            >{Math.round(endPoint.selectedHours)} h</text
          >
        {/if}
      </svg>
      {#if readout}
        <p class="readout dl-num">
          <span class="year">{readout.year}</span>
          <span>{Math.round(readout.selectedHours)} h by year end</span>
          <span class="faint"
            >+{formatHours(Math.round(years[cumulative.indexOf(readout)]?.selectedMinutes ?? 0))}
            · {readout.selectedDives} dives</span
          >
        </p>
      {/if}
    {/if}
  </div>

  {#if rhythm.length}
    <div class="chart dl-card" use:inView>
      <h3>Rhythm</h3>
      <dl class="tiles">
        {#each rhythm as tile (tile.label)}
          {@const parsed = numeric(tile.value)}
          <div class="tile">
            <dt>{tile.label}</dt>
            <dd>
              {#if parsed}
                <span
                  class="dl-num"
                  aria-hidden="true"
                  use:counter={{
                    value: parsed.n,
                    suffix: parsed.suffix,
                    decimals: parsed.decimals,
                    group: tile.group,
                    duration: 1200,
                  }}>{tile.value}</span
                ><span class="dl-visually-hidden">{tile.value}</span>
              {:else}
                <span class="dl-num">{tile.value}</span>
              {/if}
              {#if tile.note}<small>{tile.note}</small>{/if}
            </dd>
          </div>
        {/each}
      </dl>
    </div>
  {/if}

  {#if depths.length}
    <div class="chart dl-card" use:inView>
      <h3>Max depth</h3>
      <div class="bars" style="--n: {depths.length}">
        {#each depths as band, i (band.label)}
          <button
            type="button"
            class="bar-col"
            class:active={bandActive({ min: filter.minDepth, max: filter.maxDepth }, band)}
            class:empty={narrowed && !band.selected}
            style="--i: {i}"
            aria-pressed={bandActive({ min: filter.minDepth, max: filter.maxDepth }, band)}
            onclick={() => onChange(toggleDepthBand(filter, band))}
          >
            <span class="dl-visually-hidden"
              >Max depth {band.label} m: {band.total} dives{narrowed
                ? `, ${band.selected} selected`
                : ''}</span
            >
            <span class="bar-stack" aria-hidden="true">
              <span class="bar-value dl-num" style="bottom: {pct(band.selected, depthMax)}%"
                >{narrowed && !band.selected ? '' : band.selected}</span
              >
              {#if narrowed}<span
                  class="bar depth ghost"
                  style="height: {pct(band.total, depthMax)}%"
                ></span>{/if}
              <span class="bar depth" style="height: {pct(band.selected, depthMax)}%"></span>
            </span>
            <span class="bar-label dl-num" aria-hidden="true">{band.label}</span>
          </button>
        {/each}
      </div>
    </div>
  {/if}

  {#if durations.length}
    <div class="chart dl-card" use:inView>
      <h3>Bottom time</h3>
      <div class="bars" style="--n: {durations.length}">
        {#each durations as band, i (band.label)}
          <button
            type="button"
            class="bar-col"
            class:active={bandActive({ min: filter.minDuration, max: filter.maxDuration }, band)}
            class:empty={narrowed && !band.selected}
            style="--i: {i}"
            aria-pressed={bandActive({ min: filter.minDuration, max: filter.maxDuration }, band)}
            onclick={() => onChange(toggleDurationBand(filter, band))}
          >
            <span class="dl-visually-hidden"
              >Bottom time {band.label} min: {band.total} dives{narrowed
                ? `, ${band.selected} selected`
                : ''}</span
            >
            <span class="bar-stack" aria-hidden="true">
              <span class="bar-value dl-num" style="bottom: {pct(band.selected, durationMax)}%"
                >{narrowed && !band.selected ? '' : band.selected}</span
              >
              {#if narrowed}<span
                  class="bar time ghost"
                  style="height: {pct(band.total, durationMax)}%"
                ></span>{/if}
              <span class="bar time" style="height: {pct(band.selected, durationMax)}%"></span>
            </span>
            <span class="bar-label dl-num" aria-hidden="true">{band.label}</span>
          </button>
        {/each}
      </div>
    </div>
  {/if}

  {#if water.length}
    <div class="chart dl-card" use:inView>
      <h3>Water by country</h3>
      <ul class="hbars">
        {#each water as row, i (row.code)}
          <li>
            <button
              type="button"
              class="hbar-row temp"
              class:active={filter.country === row.code}
              class:empty={narrowed && !row.selected}
              style="--i: {i}"
              aria-pressed={filter.country === row.code}
              onclick={() => onChange(toggleOne(filter, 'country', row.code))}
            >
              <span class="dl-visually-hidden"
                >{row.name}: {row.min} to {row.max} °C, median {Math.round(row.median)} °C, over {row.dives}
                dives</span
              >
              <span class="name" aria-hidden="true"><span class="flag">{flagEmoji(row.code)}</span> {row.name}</span>
              <span class="range-track" aria-hidden="true">
                <span
                  class="range"
                  style="left: {tempX(row.min)}%; width: {Math.max(
                    tempX(row.max) - tempX(row.min),
                    1.5,
                  )}%"
                ></span>
                <span
                  class="median"
                  style="left: {tempX(row.median)}%; background: {tempColour(row.median)}"
                ></span>
              </span>
              <span class="hbar-value dl-num" aria-hidden="true">{Math.round(row.median)} °C</span>
            </button>
          </li>
        {/each}
      </ul>
    </div>
  {/if}

  {#if tags.length}
    <div class="chart dl-card" use:inView>
      <h3>Dive types</h3>
      <ul class="hbars">
        {#each tags as tag, i (tag.tag)}
          <li>
            <button
              type="button"
              class="hbar-row"
              class:active={filter.tags.includes(tag.tag)}
              class:empty={narrowed && !tag.selected}
              style="--i: {i}"
              aria-pressed={filter.tags.includes(tag.tag)}
              onclick={() => onChange(toggleTag(filter, tag.tag))}
            >
              <span class="dl-visually-hidden"
                >{tag.tag}: {tag.total} dives{narrowed ? `, ${tag.selected} selected` : ''}</span
              >
              <span class="dl-tag" data-tag={tag.tag} aria-hidden="true">{tag.tag}</span>
              <span
                aria-hidden="true"
                class="hbar-track"
                style="--bar: var(--dl-tag-{tag.tag}, var(--dl-color-accent))"
              >
                {#if narrowed}<span class="hbar ghost" style="width: {pct(tag.total, tagMax)}%"
                  ></span>{/if}
                <span class="hbar" style="width: {pct(tag.selected, tagMax)}%"></span>
              </span>
              <span class="hbar-value dl-num" aria-hidden="true">{tag.selected}</span>
            </button>
          </li>
        {/each}
      </ul>
    </div>
  {/if}

  {#if sites.length}
    <div class="chart dl-card" use:inView>
      <h3>Most dived sites</h3>
      <ul class="hbars">
        {#each sites as site, i (site.slug)}
          <li>
            <button
              type="button"
              class="hbar-row wide"
              class:active={filter.site === site.slug}
              class:empty={narrowed && !site.selected}
              style="--i: {i}"
              aria-pressed={filter.site === site.slug}
              onclick={() => onChange(toggleOne(filter, 'site', site.slug))}
            >
              <span class="dl-visually-hidden"
                >{site.name}: {site.total} dives{narrowed
                  ? `, ${site.selected} selected`
                  : ''}</span
              >
              <span class="name" aria-hidden="true">{site.name}</span>
              <span class="hbar-track" aria-hidden="true">
                {#if narrowed}<span class="hbar ghost" style="width: {pct(site.total, siteMax)}%"
                  ></span>{/if}
                <span class="hbar" style="width: {pct(site.selected, siteMax)}%"></span>
              </span>
              <span class="hbar-value dl-num" aria-hidden="true">{site.selected}</span>
            </button>
          </li>
        {/each}
      </ul>
    </div>
  {/if}

  {#if people.length}
    <div class="chart dl-card" use:inView>
      <h3>Dived most with</h3>
      <ul class="hbars">
        {#each people as person, i (person.slug)}
          <li>
            <button
              type="button"
              class="hbar-row wide"
              class:active={filter.person === person.slug}
              class:empty={narrowed && !person.selected}
              style="--i: {i}; --bar: var(--dl-color-warm)"
              aria-pressed={filter.person === person.slug}
              onclick={() => onChange(toggleOne(filter, 'person', person.slug))}
            >
              <span class="dl-visually-hidden"
                >{person.name}: {person.total} dives{narrowed
                  ? `, ${person.selected} selected`
                  : ''}</span
              >
              <span class="name" aria-hidden="true">{person.name}</span>
              <span class="hbar-track" aria-hidden="true">
                {#if narrowed}<span
                    class="hbar ghost"
                    style="width: {pct(person.total, peopleMax)}%"
                  ></span>{/if}
                <span class="hbar" style="width: {pct(person.selected, peopleMax)}%"></span>
              </span>
              <span class="hbar-value dl-num" aria-hidden="true">{person.selected}</span>
            </button>
          </li>
        {/each}
      </ul>
    </div>
  {/if}
</div>

<style>
  /* Six tracks so a card can take a third, a half or the whole row: whatever
     the count, the last row is always filled. */
  .charts {
    display: grid;
    gap: 16px;
    grid-template-columns: repeat(6, minmax(0, 1fr));
  }
  .chart {
    grid-column: span 2;
    min-width: 0;
    padding: 20px;
    background: var(--dl-color-bg-elevated);
  }
  .chart:last-child:nth-child(3n + 1) {
    grid-column: span 6;
  }
  .chart:nth-last-child(2):nth-child(3n + 1),
  .chart:last-child:nth-child(3n + 2) {
    grid-column: span 3;
  }
  @media (max-width: 900px) {
    .chart,
    .chart:last-child:nth-child(3n + 1),
    .chart:nth-last-child(2):nth-child(3n + 1),
    .chart:last-child:nth-child(3n + 2) {
      grid-column: span 3;
    }
    .chart:last-child:nth-child(odd) {
      grid-column: span 6;
    }
  }
  @media (max-width: 560px) {
    .chart,
    .chart:last-child:nth-child(3n + 1),
    .chart:nth-last-child(2):nth-child(3n + 1),
    .chart:last-child:nth-child(3n + 2),
    .chart:last-child:nth-child(odd) {
      grid-column: span 6;
    }
  }
  h3 {
    font-size: 14px;
    font-family: var(--dl-font-mono);
    font-weight: 500;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--dl-color-text-muted);
    margin-bottom: 18px;
  }

  /* Tiles */
  .tiles {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 18px 12px;
    margin: 0;
  }
  .tile dt {
    font-family: var(--dl-font-mono);
    font-size: 10.5px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--dl-color-text-faint);
    margin-bottom: 4px;
    white-space: nowrap;
  }
  .tile dd {
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .tile .dl-num {
    font-family: var(--dl-font-display);
    font-size: 20px;
    font-weight: 600;
    line-height: 1.1;
    color: var(--dl-color-text);
    white-space: nowrap;
  }
  .tile small {
    font-size: 11.5px;
    color: var(--dl-color-text-muted);
  }

  /* Vertical bars: each column is a button that narrows the log to its band. */
  .bars {
    display: grid;
    grid-template-columns: repeat(var(--n), minmax(0, 1fr));
    gap: 6px;
    height: 160px;
    align-items: end;
  }
  .bar-col {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: flex-end;
    height: 100%;
    gap: 4px;
    min-width: 0;
    padding: 0;
    border: 0;
    background: none;
    color: inherit;
    font: inherit;
    cursor: pointer;
    border-radius: 4px;
  }
  .bar-col:focus-visible {
    outline: 2px solid var(--dl-color-focus-ring);
    outline-offset: 2px;
  }
  .bar-stack {
    position: relative;
    flex: 1;
    width: 100%;
    min-height: 0;
    margin-top: 18px;
  }
  .bar {
    position: absolute;
    bottom: 0;
    left: 50%;
    translate: -50%;
    width: 100%;
    max-width: 36px;
    min-height: 2px;
    border-radius: 4px 4px 2px 2px;
    background: var(--dl-color-accent);
    transform-origin: bottom;
    transition:
      height 0.45s ease,
      transform 0.7s cubic-bezier(0.2, 0.7, 0.2, 1),
      filter 0.15s ease;
    transition-delay: 0s, calc(var(--i, 0) * 30ms), 0s;
  }
  .bar.depth {
    background: var(--dl-tag-deep);
  }
  .bar.time {
    background: var(--dl-color-warm);
  }
  .bar.ghost {
    opacity: 0.16;
  }
  .chart:global([data-anim]:not([data-inview])) .bar {
    transform: scaleY(0);
  }
  .bar-col:hover .bar:not(.ghost) {
    filter: brightness(1.2);
  }
  .bar-col.active .bar:not(.ghost) {
    outline: 2px solid var(--dl-color-warm);
    outline-offset: 2px;
  }
  .bar-col.active .bar-label,
  .bar-col:hover .bar-label {
    color: var(--dl-color-text);
  }
  .bar-col.active .bar-label {
    color: var(--dl-color-warm);
  }
  .bar-col.empty .bar-label {
    opacity: 0.5;
  }
  .bar-value {
    position: absolute;
    left: 0;
    right: 0;
    text-align: center;
    margin-bottom: 3px;
    font-size: 11px;
    line-height: 1;
    color: var(--dl-color-text-muted);
    transition: bottom 0.45s ease;
  }
  .bar-label {
    font-size: 10.5px;
    color: var(--dl-color-text-faint);
    white-space: nowrap;
    transition: color 0.15s ease;
  }

  /* The cumulative curve */
  .area-chart {
    width: 100%;
    height: auto;
    display: block;
    touch-action: pan-y;
  }
  .grid {
    stroke: var(--dl-color-border);
    stroke-width: 1;
    stroke-dasharray: 2 3;
  }
  .grid.base {
    stroke-dasharray: none;
  }
  .cum-area {
    fill: color-mix(in srgb, var(--dl-color-accent) 16%, transparent);
    transition: opacity 0.8s ease 0.6s;
  }
  .cum-line {
    fill: none;
    stroke: var(--dl-color-accent);
    stroke-width: 2;
    stroke-linejoin: round;
    stroke-linecap: round;
    stroke-dasharray: 1;
    stroke-dashoffset: 0;
    transition: stroke-dashoffset 1.4s cubic-bezier(0.4, 0, 0.2, 1) 0.1s;
  }
  .chart:global([data-anim]:not([data-inview])) .cum-line {
    stroke-dashoffset: 1;
  }
  .chart:global([data-anim]:not([data-inview])) .cum-area {
    opacity: 0;
  }
  .cum-area.ghost {
    fill: color-mix(in srgb, var(--dl-color-text-faint) 10%, transparent);
  }
  .cum-line.ghost {
    stroke: var(--dl-color-text-faint);
    stroke-width: 1;
    stroke-dasharray: none;
    opacity: 0.6;
  }
  .cursor {
    stroke: var(--dl-color-text-faint);
    stroke-width: 1;
    stroke-dasharray: 2 2;
  }
  .dot {
    fill: var(--dl-color-bg-elevated);
    stroke: var(--dl-color-accent);
    stroke-width: 2;
  }
  .axis {
    fill: var(--dl-color-text-faint);
    font-size: 9.5px;
  }
  .end {
    fill: var(--dl-color-text);
    font-size: 10.5px;
    font-weight: 600;
  }
  .readout {
    display: flex;
    flex-wrap: wrap;
    gap: 4px 12px;
    margin: 10px 0 0;
    font-size: 12px;
    color: var(--dl-color-text-muted);
  }
  .readout .year {
    color: var(--dl-color-text);
    font-weight: 600;
  }
  .readout .faint {
    color: var(--dl-color-text-faint);
  }

  /* Horizontal bars: rows are buttons that narrow the log to that value. */
  .hbars {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .hbar-row {
    width: 100%;
    display: grid;
    grid-template-columns: 96px 1fr 32px;
    gap: 10px;
    align-items: center;
    background: none;
    border: none;
    padding: 2px 0;
    color: inherit;
    font: inherit;
    text-align: left;
    cursor: pointer;
    border-radius: 4px;
  }
  .hbar-row:focus-visible {
    outline: 2px solid var(--dl-color-focus-ring);
    outline-offset: 2px;
  }
  .hbar-row.wide {
    grid-template-columns: 128px 1fr 32px;
  }
  .hbar-row.temp {
    grid-template-columns: 128px 1fr 44px;
  }
  .hbar-row:hover .name,
  .hbar-row:hover .dl-tag {
    color: var(--dl-color-accent);
  }
  .hbar-row.active .name,
  .hbar-row.active .dl-tag {
    color: var(--dl-color-warm);
  }
  .hbar-row.active .hbar-track,
  .hbar-row.active .range-track {
    outline: 1.5px solid var(--dl-color-warm);
    outline-offset: 2px;
  }
  .hbar-row.empty .name,
  .hbar-row.empty .dl-tag,
  .hbar-row.empty .hbar-value {
    opacity: 0.5;
  }
  .name {
    font-size: 13px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    transition: color 0.15s ease;
  }
  .flag {
    font-size: 12px;
  }
  .hbar-track,
  .range-track {
    position: relative;
    height: 8px;
    border-radius: 4px;
    background: var(--dl-color-surface-2);
  }
  .hbar-track {
    overflow: hidden;
  }
  .hbar {
    position: absolute;
    inset: 0 auto 0 0;
    border-radius: 4px;
    background: var(--bar, var(--dl-color-accent));
    transform-origin: left;
    transition:
      width 0.45s ease,
      transform 0.6s cubic-bezier(0.2, 0.7, 0.2, 1);
    transition-delay: 0s, calc(var(--i, 0) * 45ms);
  }
  .hbar.ghost {
    opacity: 0.2;
  }
  .chart:global([data-anim]:not([data-inview])) .hbar {
    transform: scaleX(0);
  }
  .hbar-value {
    font-size: 12px;
    color: var(--dl-color-text-muted);
    text-align: right;
  }

  /* Water temperature: the span from coldest to warmest with the median as a dot. */
  .range {
    position: absolute;
    top: 0;
    height: 100%;
    border-radius: 4px;
    background: color-mix(in srgb, var(--dl-color-accent) 30%, transparent);
    transform-origin: center;
    transition: transform 0.6s cubic-bezier(0.2, 0.7, 0.2, 1) calc(var(--i, 0) * 45ms);
  }
  .median {
    position: absolute;
    top: 50%;
    width: 12px;
    height: 12px;
    border-radius: 50%;
    translate: -50% -50%;
    border: 2px solid var(--dl-color-bg-elevated);
    transition: transform 0.5s cubic-bezier(0.2, 0.7, 0.2, 1) calc(var(--i, 0) * 45ms + 0.2s);
  }
  .chart:global([data-anim]:not([data-inview])) .range {
    transform: scaleX(0);
  }
  .chart:global([data-anim]:not([data-inview])) .median {
    transform: scale(0);
  }
</style>
