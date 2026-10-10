<script lang="ts">
  import type { NodeType, ObjectKind } from '$lib/core/dive/sitemap';

  /** One marker symbol, drawn around (0,0); `k` is map units per screen pixel. */
  let {
    type,
    objectKind = null,
    k = 1,
    color = null,
  }: {
    type: NodeType;
    objectKind?: ObjectKind | null;
    k?: number;
    color?: string | null;
  } = $props();

  // Sunken objects are the point of a site map: drawn a third larger than
  // survey stations and in a colour of their own so they read at a glance.
  const isObject = $derived(type === 'object' || type === 'platform' || type === 'wreck');
  const kindClass = $derived(
    type === 'object' ? (objectKind ?? 'other') : type === 'platform' ? 'platform' : 'wreck',
  );
</script>

<g
  class:object={isObject}
  style:color
  class={isObject ? kindClass : ''}
  transform={isObject ? 'scale(1.35)' : undefined}
>
  {#if type === 'entrance'}
    <circle class="ring" r={8 * k} />
    <circle class="dot accent" r={3.6 * k} />
  {:else if type === 'entry'}
    <line class="glyph" x1={0} y1={8 * k} x2={0} y2={-9 * k} />
    <path class="dot accent" d="M0 {-9 * k} L{9 * k} {-5.5 * k} L0 {-2 * k} Z" />
  {:else if type === 't'}
    <line class="glyph" x1={-7 * k} y1={0} x2={7 * k} y2={0} />
    <line class="glyph" x1={0} y1={0} x2={0} y2={9 * k} />
  {:else if type === 'jump'}
    <rect class="ring" x={-5.5 * k} y={-5.5 * k} width={11 * k} height={11 * k} />
  {:else if type === 'restriction'}
    <line class="glyph warm" x1={-3 * k} y1={-7.5 * k} x2={-3 * k} y2={7.5 * k} />
    <line class="glyph warm" x1={3 * k} y1={-7.5 * k} x2={3 * k} y2={7.5 * k} />
  {:else if type === 'end'}
    <line class="glyph warm" x1={0} y1={-8 * k} x2={0} y2={8 * k} />
    <circle class="dot warm" r={2.8 * k} />
  {:else if type === 'air'}
    <circle class="ring" r={7.5 * k} />
    <path class="glyph accent" d="M{-5 * k} 0 q{2.5 * k} {-3 * k} {5 * k} 0 t{5 * k} 0" />
  {:else if type === 'platform' || (type === 'object' && objectKind === 'platform')}
    <rect class="ring" x={-7 * k} y={-7 * k} width={14 * k} height={14 * k} />
    <rect class="dot" x={-3 * k} y={-3 * k} width={6 * k} height={6 * k} />
  {:else if type === 'wreck' || (type === 'object' && objectKind === 'wreck')}
    <path
      class="dot"
      d="M{-10 * k} {-1 * k} L{10 * k} {-1 * k} L{6 * k} {5 * k} L{-6 * k} {5 * k} Z"
    />
    <line class="glyph" x1={-1 * k} y1={-1 * k} x2={-1 * k} y2={-9 * k} />
  {:else if type === 'object' && objectKind === 'bus'}
    <rect class="dot" x={-10 * k} y={-5 * k} width={20 * k} height={9 * k} rx={2 * k} />
    <rect class="inverse-fill" x={-8 * k} y={-3.5 * k} width={4 * k} height={3 * k} />
    <rect class="inverse-fill" x={-2 * k} y={-3.5 * k} width={4 * k} height={3 * k} />
    <rect class="inverse-fill" x={4 * k} y={-3.5 * k} width={4 * k} height={3 * k} />
    <circle class="dot" cx={-6 * k} cy={5.5 * k} r={2 * k} />
    <circle class="dot" cx={6 * k} cy={5.5 * k} r={2 * k} />
  {:else if type === 'object' && objectKind === 'car'}
    <path
      class="dot"
      d="M{-9 * k} {3 * k} L{-7 * k} {-1 * k} L{-3 * k} {-5 * k} L{4 * k} {-5 * k} L{8 * k} {-1 *
        k} L{9 * k} {3 * k} Z"
    />
    <circle class="dot" cx={-5 * k} cy={4.5 * k} r={2 * k} />
    <circle class="dot" cx={5 * k} cy={4.5 * k} r={2 * k} />
  {:else if type === 'object' && objectKind === 'plane'}
    <line class="glyph" x1={-10 * k} y1={0} x2={10 * k} y2={0} />
    <path
      class="dot"
      d="M{-2 * k} {-1 * k} L{2 * k} {-1 * k} L{4 * k} {-9 * k} L{-4 * k} {-9 * k} Z"
    />
    <path class="dot" d="M{-2 * k} {1 * k} L{2 * k} {1 * k} L{3 * k} {7 * k} L{-3 * k} {7 * k} Z" />
    <line class="glyph" x1={8 * k} y1={-3 * k} x2={8 * k} y2={3 * k} />
  {:else if type === 'object' && objectKind === 'boat'}
    <path class="dot" d="M{-9 * k} {1 * k} L{9 * k} {1 * k} L{6 * k} {5 * k} L{-7 * k} {5 * k} Z" />
    <line class="glyph" x1={0} y1={1 * k} x2={0} y2={-9 * k} />
    <path class="dot accent" d="M0 {-9 * k} L{6 * k} {-2 * k} L0 {-2 * k} Z" />
  {:else if type === 'object' && objectKind === 'wipkip'}
    <path
      class="glyph"
      d="M0 {8 * k} L{-2 * k} {5.5 * k} L{2 * k} {3 * k} L{-2 * k} {0.5 * k} L{2 * k} {-2 *
        k} L0 {-3.5 * k}"
    />
    <ellipse class="dot warm" cx={0} cy={-6 * k} rx={6 * k} ry={3 * k} />
    <circle class="dot warm" cx={6.5 * k} cy={-8 * k} r={2.2 * k} />
    <line class="glyph" x1={-6 * k} y1={9 * k} x2={6 * k} y2={9 * k} />
  {:else if type === 'object' && objectKind === 'statue'}
    <rect class="dot" x={-6 * k} y={4 * k} width={12 * k} height={4 * k} />
    <line class="glyph" x1={0} y1={4 * k} x2={0} y2={-3 * k} />
    <line class="glyph" x1={-4 * k} y1={-1 * k} x2={4 * k} y2={-1 * k} />
    <circle class="dot" cy={-6 * k} r={2.6 * k} />
  {:else if type === 'object' && objectKind === 'container'}
    <rect class="ring" x={-10 * k} y={-5 * k} width={20 * k} height={10 * k} />
    <line class="glyph" x1={-5 * k} y1={-5 * k} x2={-5 * k} y2={5 * k} />
    <line class="glyph" x1={0} y1={-5 * k} x2={0} y2={5 * k} />
    <line class="glyph" x1={5 * k} y1={-5 * k} x2={5 * k} y2={5 * k} />
  {:else if type === 'object' && objectKind === 'pipe'}
    <line class="glyph" x1={-10 * k} y1={-2.5 * k} x2={10 * k} y2={-2.5 * k} />
    <line class="glyph" x1={-10 * k} y1={2.5 * k} x2={10 * k} y2={2.5 * k} />
    <ellipse class="ring" cx={-10 * k} cy={0} rx={1.6 * k} ry={2.5 * k} />
  {:else if type === 'object' && objectKind === 'tree'}
    <line class="glyph" x1={0} y1={9 * k} x2={0} y2={0} />
    <path class="dot" d="M0 {-10 * k} L{7 * k} {2 * k} L{-7 * k} {2 * k} Z" />
  {:else if type === 'object' && objectKind === 'ladder'}
    <line class="glyph" x1={-3.5 * k} y1={-9 * k} x2={-3.5 * k} y2={9 * k} />
    <line class="glyph" x1={3.5 * k} y1={-9 * k} x2={3.5 * k} y2={9 * k} />
    <line class="glyph" x1={-3.5 * k} y1={-5 * k} x2={3.5 * k} y2={-5 * k} />
    <line class="glyph" x1={-3.5 * k} y1={0} x2={3.5 * k} y2={0} />
    <line class="glyph" x1={-3.5 * k} y1={5 * k} x2={3.5 * k} y2={5 * k} />
  {:else if type === 'object' && objectKind === 'cage'}
    <rect class="ring" x={-7 * k} y={-7 * k} width={14 * k} height={14 * k} rx={1 * k} />
    <line class="glyph" x1={-2.5 * k} y1={-7 * k} x2={-2.5 * k} y2={7 * k} />
    <line class="glyph" x1={2.5 * k} y1={-7 * k} x2={2.5 * k} y2={7 * k} />
  {:else if type === 'object' && objectKind === 'net'}
    <path
      class="glyph thin"
      d="M{-8 * k} {-8 * k} L{8 * k} {8 * k} M{-8 * k} {8 * k} L{8 * k} {-8 * k} M0 {-8 * k} L0 {8 *
        k} M{-8 * k} 0 L{8 * k} 0"
    />
  {:else if type === 'object' && objectKind === 'anchor'}
    <circle class="ring" cy={-7 * k} r={2.2 * k} />
    <line class="glyph" x1={0} y1={-5 * k} x2={0} y2={8 * k} />
    <line class="glyph" x1={-5 * k} y1={-2 * k} x2={5 * k} y2={-2 * k} />
    <path
      class="glyph"
      d="M{-8 * k} {3 * k} q{2 * k} {6 * k} {8 * k} {5 * k} q{6 * k} {1 * k} {8 * k} {-5 * k}"
    />
  {:else if type === 'object' && objectKind === 'pinnacle'}
    <path class="dot" d="M0 {-9 * k} L{7 * k} {7 * k} L{-7 * k} {7 * k} Z" />
    <path class="inverse-fill" d="M0 {-2 * k} L{2.5 * k} {4 * k} L{-2.5 * k} {4 * k} Z" />
  {:else if type === 'object' && objectKind === 'house'}
    <rect class="dot" x={-6 * k} y={-1 * k} width={12 * k} height={8 * k} />
    <path class="dot" d="M{-8 * k} {-1 * k} L0 {-9 * k} L{8 * k} {-1 * k} Z" />
  {:else if type === 'object' && objectKind === 'caravan'}
    <rect class="dot" x={-10 * k} y={-6 * k} width={19 * k} height={11 * k} rx={3 * k} />
    <rect class="inverse-fill" x={-7 * k} y={-3.5 * k} width={5 * k} height={3.5 * k} />
    <rect class="inverse-fill" x={1 * k} y={-3.5 * k} width={5 * k} height={3.5 * k} />
    <circle class="dot" cx={-1 * k} cy={6 * k} r={2 * k} />
    <line class="glyph" x1={9 * k} y1={3 * k} x2={12 * k} y2={5 * k} />
  {:else if type === 'object' && objectKind === 'lighthouse'}
    <path
      class="dot"
      d="M{-4 * k} {8 * k} L{-2.5 * k} {-5 * k} L{2.5 * k} {-5 * k} L{4 * k} {8 * k} Z"
    />
    <rect class="dot accent" x={-3.5 * k} y={-9 * k} width={7 * k} height={4 * k} />
    <line class="glyph" x1={-7 * k} y1={8 * k} x2={7 * k} y2={8 * k} />
  {:else if type === 'object' && objectKind === 'machine'}
    <circle class="ring" r={6 * k} />
    <line class="glyph" x1={0} y1={-9.5 * k} x2={0} y2={-6 * k} />
    <line class="glyph" x1={0} y1={6 * k} x2={0} y2={9.5 * k} />
    <line class="glyph" x1={-9.5 * k} y1={0} x2={-6 * k} y2={0} />
    <line class="glyph" x1={6 * k} y1={0} x2={9.5 * k} y2={0} />
    <line class="glyph" x1={-6.7 * k} y1={-6.7 * k} x2={-4.2 * k} y2={-4.2 * k} />
    <line class="glyph" x1={6.7 * k} y1={6.7 * k} x2={4.2 * k} y2={4.2 * k} />
    <line class="glyph" x1={-6.7 * k} y1={6.7 * k} x2={-4.2 * k} y2={4.2 * k} />
    <line class="glyph" x1={6.7 * k} y1={-6.7 * k} x2={4.2 * k} y2={-4.2 * k} />
    <circle class="dot" r={2 * k} />
  {:else if type === 'object' && objectKind === 'ruin'}
    <path
      class="dot"
      d="M{-10 * k} {7 * k} L{-10 * k} {-3 * k} L{-6 * k} {-3 * k} L{-6 * k} {-8 * k} L{-1 *
        k} {-8 * k} L{-1 * k} {-1 * k} L{3 * k} {-1 * k} L{3 * k} {-5 * k} L{7 * k} {-5 * k} L{7 *
        k} {2 * k} L{10 * k} {2 * k} L{10 * k} {7 * k} Z"
    />
    <line class="glyph inverse thin" x1={-6 * k} y1={1 * k} x2={-6 * k} y2={7 * k} />
    <line class="glyph inverse thin" x1={2 * k} y1={3 * k} x2={2 * k} y2={7 * k} />
  {:else if type === 'object' && objectKind === 'gate'}
    <line class="glyph" x1={-6 * k} y1={9 * k} x2={-6 * k} y2={-5 * k} />
    <line class="glyph" x1={6 * k} y1={9 * k} x2={6 * k} y2={-5 * k} />
    <path class="glyph" d="M{-11 * k} {-7 * k} Q0 {-9.5 * k} {11 * k} {-7 * k}" />
    <line class="glyph" x1={-8 * k} y1={-2 * k} x2={8 * k} y2={-2 * k} />
  {:else if type === 'object' && objectKind === 'reel'}
    <circle class="ring" r={8 * k} />
    <circle class="ring" r={3 * k} />
    <path class="glyph thin" d="M{8 * k} {2 * k} Q{12 * k} {5 * k} {13 * k} {9 * k}" />
  {:else if type === 'object' && objectKind === 'postbox'}
    <rect class="dot" x={-6 * k} y={-9 * k} width={12 * k} height={13 * k} rx={2 * k} />
    <line class="glyph inverse thin" x1={-3 * k} y1={-5 * k} x2={3 * k} y2={-5 * k} />
    <line class="glyph" x1={0} y1={4 * k} x2={0} y2={9 * k} />
  {:else if type === 'object' && objectKind === 'bridge'}
    <path class="glyph" d="M{-10 * k} {5 * k} Q0 {-9 * k} {10 * k} {5 * k}" />
    <line class="glyph" x1={-11 * k} y1={5 * k} x2={11 * k} y2={5 * k} />
    <line class="glyph thin" x1={-5 * k} y1={5 * k} x2={-5 * k} y2={-1 * k} />
    <line class="glyph thin" x1={5 * k} y1={5 * k} x2={5 * k} y2={-1 * k} />
  {:else if type === 'object' && objectKind === 'shark'}
    <path
      class="dot"
      d="M{-11 * k} {1 * k} Q{-5 * k} {-4 * k} {2 * k} {-3 * k} L{10 * k} {-7 * k} L{8 * k} {1 *
        k} Q{6 * k} {5 * k} 0 {4.5 * k} Q{-6 * k} {4.5 * k} {-11 * k} {1 * k} Z"
    />
    <path class="dot" d="M{-3 * k} {-2.5 * k} L0 {-9 * k} L{3 * k} {-3 * k} Z" />
    <circle class="inverse-fill" cx={-7 * k} cy={0} r={1 * k} />
  {:else if type === 'object' && objectKind === 'hopper'}
    <path
      class="dot"
      d="M{-9 * k} {-8 * k} L{9 * k} {-8 * k} L{3 * k} {2 * k} L{-3 * k} {2 * k} Z"
    />
    <rect class="dot" x={-2 * k} y={2 * k} width={4 * k} height={3 * k} />
    <line class="glyph" x1={-7 * k} y1={-2 * k} x2={-7 * k} y2={9 * k} />
    <line class="glyph" x1={7 * k} y1={-2 * k} x2={7 * k} y2={9 * k} />
  {:else if type === 'object' && objectKind === 'truck'}
    <rect class="dot" x={-11 * k} y={-6 * k} width={14 * k} height={9 * k} />
    <path
      class="dot"
      d="M{3 * k} {-3 * k} L{8 * k} {-3 * k} L{11 * k} {1 * k} L{11 * k} {3 * k} L{3 * k} {3 * k} Z"
    />
    <rect class="inverse-fill" x={5 * k} y={-1.5 * k} width={3 * k} height={2.5 * k} />
    <circle class="dot" cx={-7 * k} cy={5 * k} r={2 * k} />
    <circle class="dot" cx={-1 * k} cy={5 * k} r={2 * k} />
    <circle class="dot" cx={7 * k} cy={5 * k} r={2 * k} />
  {:else if type === 'object' && objectKind === 'turtle'}
    <ellipse
      class="dot"
      cx={4.5 * k}
      cy={-6 * k}
      rx={3.2 * k}
      ry={1.6 * k}
      transform="rotate(-40)"
    />
    <ellipse class="dot" cx={4.5 * k} cy={6 * k} rx={3.2 * k} ry={1.6 * k} transform="rotate(40)" />
    <ellipse class="dot" cx={-4.5 * k} cy={-6 * k} rx={3 * k} ry={1.5 * k} transform="rotate(40)" />
    <ellipse class="dot" cx={-4.5 * k} cy={6 * k} rx={3 * k} ry={1.5 * k} transform="rotate(-40)" />
    <path class="dot" d="M{-6.5 * k} {-1.2 * k} L{-10.5 * k} 0 L{-6.5 * k} {1.2 * k} Z" />
    <circle class="dot" cx={9.5 * k} cy={0} r={2.3 * k} />
    <ellipse class="dot" rx={7.2 * k} ry={5.4 * k} />
    <ellipse class="inverse-fill" rx={3.2 * k} ry={2.3 * k} />
  {:else if type === 'object'}
    <rect class="dot" x={-5 * k} y={-5 * k} width={10 * k} height={10 * k} rx={2 * k} />
  {:else if type === 'buoy'}
    <circle class="ring" r={5 * k} />
    <line class="glyph" x1={0} y1={-5 * k} x2={0} y2={-12 * k} />
    <circle class="dot" r={1.8 * k} />
  {:else if type === 'hazard'}
    <path class="dot warm" d="M0 {-9 * k} L{9 * k} {7 * k} L{-9 * k} {7 * k} Z" />
    <line class="glyph inverse" x1={0} y1={-3 * k} x2={0} y2={2 * k} />
    <circle class="dot inverse" cy={4.5 * k} r={1 * k} />
  {:else if type === 'poi'}
    <circle class="ring" r={6 * k} />
    <circle class="dot accent" r={2.2 * k} />
  {:else if type === 'marker'}
    <path class="dot" d="M0 {-7 * k} L{6 * k} 0 L0 {7 * k} L{-6 * k} 0 Z" />
  {:else}
    <circle class="dot" r={3.5 * k} />
  {/if}
</g>

<style>
  .dot {
    fill: currentColor;
  }
  .ring {
    fill: var(--map-bg, var(--dl-color-bg-elevated));
    stroke: currentColor;
    stroke-width: 2px;
    vector-effect: non-scaling-stroke;
  }
  .glyph {
    fill: none;
    stroke: currentColor;
    stroke-width: 2.5px;
    stroke-linecap: round;
    stroke-linejoin: round;
    vector-effect: non-scaling-stroke;
  }
  .glyph.thin {
    stroke-width: 1.5px;
  }
  .accent {
    color: var(--dl-color-accent);
  }
  .warm {
    color: var(--dl-color-warm);
  }
  .inverse {
    color: var(--map-bg, var(--dl-color-bg-elevated));
  }
  .inverse-fill {
    fill: var(--map-bg, var(--dl-color-bg-elevated));
  }
  .object.house {
    color: #f4a261;
  }
  .object.wreck {
    color: #f2567a;
  }
  .object.boat {
    color: #30c573;
  }
  .object.platform {
    color: #7c9cff;
  }
  .object.container {
    color: #4cc9f0;
  }
  .object.pipe {
    color: #b48cff;
  }
  .object.bus {
    color: #ffd166;
  }
  .object.car {
    color: #ff9f43;
  }
  .object.plane {
    color: #93c5fd;
  }
  .object.statue {
    color: #e6d8b5;
  }
  .object.tree {
    color: #6fcf97;
  }
  .object.wipkip {
    color: #ff7ab6;
  }
  .object.ladder {
    color: #cbd5e1;
  }
  .object.cage {
    color: #a3b18a;
  }
  .object.net {
    color: #9ad0ec;
  }
  .object.anchor {
    color: #d4a373;
  }
  .object.pinnacle {
    color: #c9a26b;
  }
  .object.caravan {
    color: #c8b6ff;
  }
  .object.lighthouse {
    color: #ff8fa3;
  }
  .object.machine {
    color: #b8c0cc;
  }
  .object.ruin {
    color: #a68a64;
  }
  .object.gate {
    color: #ff5c8a;
  }
  .object.reel {
    color: #8ecae6;
  }
  .object.postbox {
    color: #ffd60a;
  }
  .object.bridge {
    color: #9bb1ff;
  }
  .object.shark {
    color: #e2e8f0;
  }
  .object.hopper {
    color: #d3a7b1;
  }
  .object.truck {
    color: #f4d35e;
  }
  .object.turtle {
    color: #4ade80;
  }
  .object.other {
    color: #94a3b8;
  }
</style>
