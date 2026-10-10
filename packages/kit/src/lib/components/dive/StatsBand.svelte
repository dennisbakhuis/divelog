<script lang="ts">
  import type { DiveStats } from '$lib/core/dive/types';
  import { headlineTiles, notableTiles, recordTiles } from '$lib/core/dive/stats-view';
  import { getDivelog } from '$lib/core/dive/context';
  import { counter } from '$lib/components/anim/counter';
  import { reveal } from '$lib/components/anim/reveal';

  let { stats }: { stats: DiveStats } = $props();

  const headline = $derived(headlineTiles(stats));
  const { urls } = getDivelog();
  const notable = $derived(notableTiles(stats, urls));
  const records = $derived(recordTiles(stats, urls));

  function numeric(value: string): { n: number; suffix: string; decimals: number } | null {
    const m = /^([\d.]+)(.*)$/.exec(value);
    if (!m) return null;
    const n = Number(m[1]);
    if (!Number.isFinite(n)) return null;
    return { n, suffix: m[2], decimals: m[1].includes('.') ? 1 : 0 };
  }
</script>

<section class="band" use:reveal={{ stagger: 50 }}>
  <div class="dl-container">
    <dl class="headline">
      {#each headline as tile (tile.label)}
        {@const num = numeric(tile.value)}
        <div class="tile" data-reveal>
          <dt>{tile.label}</dt>
          <dd class="dl-num">
            {#if num}
              <span
                aria-hidden="true"
                use:counter={{
                  value: num.n,
                  decimals: num.decimals,
                  suffix: num.suffix,
                  group: tile.group,
                }}>{tile.value}</span
              ><span class="dl-visually-hidden">{tile.value}</span>
            {:else}
              {tile.value}
            {/if}
          </dd>
          {#if tile.note}<span class="note">{tile.note}</span>{/if}
        </div>
      {/each}
    </dl>
    <div class="secondary">
      <div class="notable">
        {#each notable as tile (tile.label)}
          <a class="mini" href={tile.href} data-reveal>
            <span class="k">{tile.label}</span>
            <span class="v dl-num">{tile.value}</span>
          </a>
        {/each}
      </div>
      <div class="records">
        {#each records as tile (tile.label)}
          <a class="mini record" href={tile.href} data-reveal>
            <span class="k">{tile.label}</span>
            <span class="v dl-num">{tile.value}</span>
            {#if tile.note}<span class="note">{tile.note}</span>{/if}
          </a>
        {/each}
      </div>
    </div>
  </div>
</section>

<style>
  .band {
    background: var(--dl-color-bg-elevated);
    border-top: 1px solid var(--dl-color-border);
    border-bottom: 1px solid var(--dl-color-border);
    padding: 40px 0;
  }
  dl {
    margin: 0;
  }
  .headline {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
    gap: 24px 16px;
  }
  .tile dt,
  .mini .k {
    font-family: var(--dl-font-mono);
    font-size: var(--dl-text-xs);
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--dl-color-text-muted);
  }
  .tile {
    container-type: inline-size;
    min-width: 0;
  }
  .tile dd {
    margin: 4px 0 0;
    font-size: clamp(30px, 4vw, 44px);
    font-size: clamp(24px, min(4vw, 21cqi), 44px);
    font-weight: 500;
    line-height: 1;
    white-space: nowrap;
    color: var(--dl-color-text);
  }
  .note {
    display: block;
    font-size: var(--dl-text-sm);
    color: var(--dl-color-text-faint);
    margin-top: 4px;
  }
  .secondary {
    margin-top: 32px;
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
    align-items: flex-start;
    justify-content: space-between;
  }
  .notable,
  .records {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
  }
  .mini {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 10px 14px;
    border-radius: var(--dl-radius);
    border: 1px solid var(--dl-color-border);
    background: var(--dl-color-surface);
    text-decoration: none;
    color: inherit;
    min-width: 120px;
    transition: border-color 0.15s ease;
  }
  .mini:hover {
    border-color: var(--dl-color-accent);
  }
  .mini .v {
    margin: 0;
    font-size: var(--dl-text-2xl);
    font-weight: 500;
    line-height: 1.1;
  }
  .record .v {
    color: var(--dl-color-warm);
  }
</style>
