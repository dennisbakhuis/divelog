<script lang="ts">
  import {
    COLOUR_MODES,
    SIZE_MODES,
    type ColourMode,
    type MapOptionsPatch,
    type SizeMode,
  } from '$lib/core/dive/stats-view';

  let {
    size,
    colour,
    labels = null,
    onOptions,
    onLabels,
  }: {
    size: SizeMode;
    colour: ColourMode;
    /** Whether site names show next to the dots; null hides the switch (the static map has none). */
    labels?: boolean | null;
    /** Without it the size and colour selects stay out, leaving only the label switch. */
    onOptions?: (patch: MapOptionsPatch) => void;
    onLabels?: (on: boolean) => void;
  } = $props();
</script>

<div class="options">
  {#if onOptions}
    <label>
      Size by
      <select
        value={size}
        onchange={(e) => onOptions?.({ mapSize: e.currentTarget.value as SizeMode })}
      >
        {#each SIZE_MODES as m (m.mode)}<option value={m.mode}>{m.label}</option>{/each}
      </select>
    </label>
    <label>
      Colour by
      <select
        value={colour}
        onchange={(e) => onOptions?.({ mapColour: e.currentTarget.value as ColourMode })}
      >
        {#each COLOUR_MODES as m (m.mode)}<option value={m.mode}>{m.label}</option>{/each}
      </select>
    </label>
  {/if}
  {#if labels !== null}
    <label class="switch">
      <input
        type="checkbox"
        role="switch"
        checked={labels}
        aria-checked={labels}
        onchange={(e) => onLabels?.(e.currentTarget.checked)}
      />
      <span class="knob" aria-hidden="true"></span>
      Labels
    </label>
  {/if}
</div>

<style>
  .options {
    display: flex;
    flex-wrap: wrap;
    gap: 12px 16px;
    padding: 8px 8px 2px;
    border-top: 1px solid var(--dl-color-border);
    margin-top: 6px;
  }
  .options label {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 12.5px;
    color: var(--dl-color-text-muted);
    font-family: var(--dl-font-mono);
  }
  .options select {
    font: inherit;
    font-size: 12.5px;
    color: var(--dl-color-text);
    background: var(--dl-color-surface);
    border: 1px solid var(--dl-color-border-strong);
    border-radius: var(--dl-radius-sm);
    padding: 4px 8px;
  }
  .switch {
    cursor: pointer;
    position: relative;
  }
  .switch input {
    position: absolute;
    opacity: 0;
    width: 1px;
    height: 1px;
  }
  .knob {
    width: 30px;
    height: 16px;
    border-radius: 999px;
    background: var(--dl-color-surface-2);
    border: 1px solid var(--dl-color-border-strong);
    position: relative;
    transition: background 0.15s ease;
  }
  .knob::after {
    content: '';
    position: absolute;
    top: 2px;
    left: 2px;
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: var(--dl-color-text-muted);
    transition:
      transform 0.15s ease,
      background 0.15s ease;
  }
  .switch input:checked + .knob {
    background: var(--dl-color-accent-soft);
    border-color: var(--dl-color-accent);
  }
  .switch input:checked + .knob::after {
    transform: translateX(14px);
    background: var(--dl-color-accent);
  }
  .switch input:focus-visible + .knob {
    outline: 2px solid var(--dl-color-focus-ring);
    outline-offset: 2px;
  }
</style>
