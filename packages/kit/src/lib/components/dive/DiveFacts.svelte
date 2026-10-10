<script lang="ts">
  import { formatDepth, formatTemp, gasLabel, modeLabel } from '$lib/core/dive/format';
  import { profileSpark } from '$lib/core/dive/dive-page';
  import type { Dive } from '$lib/core/dive/types';
  import { getDivelog } from '$lib/core/dive/context';

  const { urls } = getDivelog();

  type Fact = { label: string; value: string; numeric: boolean; title?: string; sub?: string };

  let { dive }: { dive: Dive } = $props();

  const SPARK_W = 120;
  const SPARK_H = 48;

  const spark = $derived(
    dive.profile && dive.profile.length > 1
      ? profileSpark(dive.profile, SPARK_W, SPARK_H, 3)
      : null,
  );

  const present = (f: Fact | null | false): f is Fact => Boolean(f);

  const numbers = $derived(
    [
      { label: 'Max depth', value: formatDepth(dive.max_depth_m), numeric: true },
      dive.avg_depth_m !== null && {
        label: 'Avg depth',
        value: formatDepth(dive.avg_depth_m),
        numeric: true,
      },
      { label: 'Bottom time', value: `${Math.round(dive.duration_min)} min`, numeric: true },
      dive.water_temp_c !== null && {
        label: 'Water',
        value: formatTemp(dive.water_temp_c),
        numeric: true,
      },
      dive.sac_l_min !== null && {
        label: 'SAC',
        value: `${dive.sac_l_min.toFixed(1)} l/min`,
        numeric: true,
        title: dive.sac_basis ?? undefined,
        sub: dive.sac_basis ?? undefined,
      },
      dive.surface_temp_c !== null && {
        label: 'Surface',
        value: formatTemp(dive.surface_temp_c),
        numeric: true,
      },
      dive.air_temp_c !== null && {
        label: 'Air',
        value: formatTemp(dive.air_temp_c),
        numeric: true,
      },
      dive.thermocline_m !== null && {
        label: 'Thermocline',
        value: `${dive.thermocline_m} m`,
        numeric: true,
      },
      (dive.visibility_raw !== null || dive.visibility_m !== null) && {
        label: 'Visibility',
        value: dive.visibility_raw ?? `${dive.visibility_m} m`,
        numeric: true,
      },
    ].filter(present),
  );

  /** " · measured 29.2 %" when the analyser read something other than the fill ordered. */
  function measured(pct: number | null): string {
    return pct === null ? '' : ` · measured ${pct} %`;
  }

  const ROLE_LABEL: Record<string, string> = {
    back: 'Back gas',
    stage: 'Stage',
    deco: 'Deco gas',
    bailout: 'Bailout',
  };

  /** One fact per tank: "D12 · Nitrox 32 · 200 → 80 bar", labelled by its role. */
  const tankFacts = $derived(
    dive.tanks.map((tank, i) => {
      const same = dive.tanks.filter((t) => t.role === tank.role).length > 1;
      const label = `${ROLE_LABEL[tank.role] ?? tank.role}${same ? ` ${dive.tanks.slice(0, i + 1).filter((t) => t.role === tank.role).length}` : ''}`;
      const parts = [
        tank.cylinder + (tank.volume_l ? ` (${tank.volume_l} L)` : ''),
        gasLabel(tank.gas, tank.o2_pct, tank.he_pct) + measured(tank.o2_measured_pct),
      ];
      if (tank.pressure_in_bar !== null)
        parts.push(`${tank.pressure_in_bar} → ${tank.pressure_out_bar ?? '?'} bar`);
      return { label, value: parts.join(' · '), numeric: false };
    }),
  );

  const kit = $derived(
    [
      ...(dive.tanks.length
        ? tankFacts
        : [
            {
              label: 'Gas',
              value: gasLabel(dive.gas, dive.o2_pct, dive.he_pct) + measured(dive.o2_measured_pct),
              numeric: false,
            },
            !!dive.cylinder && { label: 'Cylinder', value: dive.cylinder, numeric: false },
            dive.pressure_in_bar !== null && {
              label: 'Pressure',
              value: `${dive.pressure_in_bar} → ${dive.pressure_out_bar ?? '?'} bar`,
              numeric: true,
            },
          ]),
      { label: 'Mode', value: modeLabel(dive.mode), numeric: false },
      dive.weights_kg !== null && {
        label: 'Weights',
        value: `${dive.weights_kg} kg`,
        numeric: true,
      },
      !!dive.suit && { label: 'Suit', value: dive.suit, numeric: false },
      !!dive.surface_interval && {
        label: 'Surface interval',
        value: dive.surface_interval,
        numeric: true,
      },
      dive.safety_stop_min !== null && {
        label: 'Safety stop',
        value: `${dive.safety_stop_min} min`,
        numeric: true,
      },
      !!dive.difficulty && { label: 'Difficulty', value: dive.difficulty, numeric: false },
      !!dive.course && { label: 'Course / purpose', value: dive.course, numeric: false },
      !!dive.guide && { label: 'Guide', value: dive.guide, numeric: false },
    ].filter(present),
  );
</script>

<div class="facts">
  <dl class="row">
    {#if spark}
      <div class="spark-tile">
        <dt>Profile</dt>
        <dd class="spark-cell">
          <svg
            class="spark"
            viewBox="0 0 {SPARK_W} {SPARK_H}"
            preserveAspectRatio="none"
            role="img"
            aria-label="Depth over time, down to {formatDepth(dive.max_depth_m)}"
          >
            <path class="spark-area" d={spark.area} />
            <path class="spark-line" d={spark.line} vector-effect="non-scaling-stroke" />
          </svg>
        </dd>
      </div>
    {/if}
    {#each numbers as fact (fact.label)}
      <div title={fact.title}>
        <dt>{fact.label}</dt>
        <dd class:dl-num={fact.numeric}>
          {fact.value}{#if fact.sub}<small class="sub dl-num">{fact.sub}</small>{/if}
        </dd>
      </div>
    {/each}
  </dl>

  <p class="divider"><span>Kit</span></p>

  <dl class="row">
    {#each kit as fact (fact.label)}
      <div>
        <dt>{fact.label}</dt>
        <dd class:dl-num={fact.numeric}>{fact.value}</dd>
      </div>
    {/each}
    {#if dive.gear_setup}<div>
        <dt>Setup</dt>
        <dd><a href={urls.gear(dive.gear_setup.slug)}>{dive.gear_setup.name}</a></dd>
      </div>{/if}
    {#if dive.rating}<div>
        <dt>Rating</dt>
        <dd aria-label="{dive.rating} out of 5">
          {'★'.repeat(dive.rating)}{'☆'.repeat(5 - dive.rating)}
        </dd>
      </div>{/if}
    {#if dive.conditions}<div class="wide">
        <dt>Conditions</dt>
        <dd class="small">{dive.conditions}</dd>
      </div>{/if}
  </dl>
</div>

<style>
  .facts {
    margin: 22px 0 0;
    padding: 16px 18px;
    border-radius: var(--dl-radius);
    border: 1px solid var(--dl-color-border);
    background: var(--dl-color-bg-elevated);
  }
  .row {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
    gap: 14px 16px;
    margin: 0;
  }
  .row > div {
    display: grid;
    grid-row: span 2;
    grid-template-rows: subgrid;
    row-gap: 0;
    align-content: start;
    min-width: 0;
  }
  .row .wide {
    grid-column: 1 / -1;
  }
  dt {
    font-family: var(--dl-font-mono);
    font-size: 10.5px;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    white-space: nowrap;
    color: var(--dl-color-text-muted);
  }
  dd {
    margin: 2px 0 0;
    font-size: 18px;
    line-height: 1.3;
    font-weight: 500;
    overflow-wrap: anywhere;
  }
  dd.small {
    font-size: 14px;
    font-weight: 400;
  }
  .sub {
    display: block;
    font-size: 11.5px;
    font-weight: 400;
    color: var(--dl-color-text-faint);
  }
  .spark-tile {
    grid-column: span 2;
  }
  .spark-cell {
    margin: 2px 0 0;
    height: 46px;
  }
  .spark {
    width: 100%;
    height: 100%;
    display: block;
  }
  .spark-area {
    fill: var(--dl-color-accent-soft);
  }
  .spark-line {
    fill: none;
    stroke: var(--dl-color-accent);
    stroke-width: 1.5;
    stroke-linejoin: round;
  }
  .divider {
    display: flex;
    align-items: center;
    gap: 10px;
    margin: 16px 0 12px;
    font-family: var(--dl-font-mono);
    font-size: 10px;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--dl-color-text-faint);
  }
  .divider::after {
    content: '';
    flex: 1;
    border-top: 1px solid var(--dl-color-border);
  }
  @media (max-width: 480px) {
    .facts {
      padding: 16px;
    }
    .row {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }
</style>
