<script lang="ts" module>
  /** Attributes for the wrapped control; spread them on the input, select or `Combobox`. */
  export interface FieldControlProps {
    id: string;
    'aria-describedby': string | undefined;
    'aria-invalid': 'true' | undefined;
    required: boolean | undefined;
  }
</script>

<script lang="ts">
  import type { Snippet } from 'svelte';

  let {
    label,
    id = '',
    hint = '',
    error = '',
    required = false,
    layout = 'stacked',
    hideLabel = false,
    class: className = '',
    describedby = '',
    children,
    extra,
  }: {
    label: string;
    /** Id of the control; generated when empty. */
    id?: string;
    /** Help under the control, linked with `aria-describedby`. */
    hint?: string;
    /** Error message; sets `aria-invalid` and is linked with `aria-describedby`. */
    error?: string | null;
    /** Shows a marker and passes `required` to the control. */
    required?: boolean;
    /** `stacked`: label above; `horizontal`: label beside the control (wide screens). */
    layout?: 'stacked' | 'horizontal';
    /** Keep the label for assistive technology only. */
    hideLabel?: boolean;
    class?: string;
    /** More ids to describe the control with (a shared note). */
    describedby?: string;
    children: Snippet<[FieldControlProps]>;
    /** Content after the label text, inside the label row (a "from #649" chip). */
    extra?: Snippet;
  } = $props();

  const propsId = $props.id();
  const uid = `dl-field-${propsId}`;
  const controlId = $derived(id || uid);
  const hintId = $derived(`${controlId}-hint`);
  const errorId = $derived(`${controlId}-error`);

  const control = $derived<FieldControlProps>({
    id: controlId,
    'aria-describedby':
      [error ? errorId : '', hint ? hintId : '', describedby].filter(Boolean).join(' ') ||
      undefined,
    'aria-invalid': error ? 'true' : undefined,
    required: required || undefined,
  });
</script>

<div
  class="dl-field dl-field--{layout} {className}"
  class:dl-field--invalid={!!error}
  data-field={controlId}
>
  <div class="dl-field-label-row">
    <label for={controlId} class="dl-field-label" class:dl-visually-hidden={hideLabel}
      >{label}{#if required}<span class="dl-field-req" aria-hidden="true">*</span>{/if}</label
    >
    {#if extra}{@render extra()}{/if}
  </div>
  <div class="dl-field-control">
    {@render children(control)}
    {#if error}<p class="dl-field-error" id={errorId}>
        <span aria-hidden="true">⚠</span>
        {error}
      </p>{/if}
    {#if hint}<p class="dl-field-hint" id={hintId}>{hint}</p>{/if}
  </div>
</div>

<style>
  .dl-field {
    display: flex;
    flex-direction: column;
    gap: var(--dl-space-1);
    min-width: 0;
  }
  .dl-field--horizontal {
    display: grid;
    grid-template-columns: minmax(8rem, 12rem) 1fr;
    align-items: start;
    gap: var(--dl-space-1) var(--dl-space-3);
  }
  .dl-field--horizontal .dl-field-label-row {
    padding-top: var(--dl-space-2);
  }
  @media (max-width: 560px) {
    .dl-field--horizontal {
      display: flex;
    }
    .dl-field--horizontal .dl-field-label-row {
      padding-top: 0;
    }
  }
  .dl-field-label-row {
    display: flex;
    align-items: baseline;
    gap: var(--dl-space-2);
    flex-wrap: wrap;
  }
  .dl-field .dl-field-label {
    display: inline;
    font-size: var(--dl-text-md);
    color: var(--dl-color-text-muted);
  }
  .dl-field-req {
    margin-left: 2px;
    color: var(--dl-color-warm);
  }
  .dl-field-control {
    display: flex;
    flex-direction: column;
    gap: var(--dl-space-1);
    min-width: 0;
  }
  .dl-field-hint,
  .dl-field-error {
    margin: 0;
    font-size: var(--dl-text-sm);
    line-height: 1.4;
  }
  .dl-field-hint {
    color: var(--dl-color-text-faint);
  }
  .dl-field-error {
    color: var(--dl-color-danger);
  }
</style>
