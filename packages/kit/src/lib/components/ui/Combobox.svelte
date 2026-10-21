<script lang="ts">
  import type { Snippet } from 'svelte';
  import { tick, untrack } from 'svelte';
  import type { HTMLInputAttributes } from 'svelte/elements';
  import {
    filterOptions,
    flattenGroups,
    groupOptions,
    moveActive,
    uniqueOptions,
    type ComboOption,
  } from '$lib/core/ui/combobox.js';

  type Source = (query: string, signal: AbortSignal) => Promise<ComboOption[]>;

  let {
    id = '',
    label = '',
    multiple = false,
    value = $bindable(null),
    values = $bindable([]),
    options = [],
    source,
    known = [],
    debounce = 200,
    minChars = 0,
    placeholder = '',
    required = false,
    disabled = false,
    clearable = true,
    name = '',
    emptyText = 'No matches',
    loadingText = 'Searching…',
    onchange,
    option: optionSnippet,
    footer,
    ...rest
  }: {
    /** Id of the text input, for `<label for>` / `Field`. */
    id?: string;
    /** Accessible name when no `<label for>` points at the input. */
    label?: string;
    /** Select several values, shown as removable chips. */
    multiple?: boolean;
    /** Selected value (single mode). */
    value?: string | null;
    /** Selected values (multiple mode). */
    values?: string[];
    /** Static options, filtered on the client as the owner types. */
    options?: ComboOption[];
    /** Async options for a query (debounced; the signal aborts stale requests). */
    source?: Source;
    /** Options known up front to label the current value(s) of an async source. */
    known?: ComboOption[];
    debounce?: number;
    /** Characters to type before the async source is asked. */
    minChars?: number;
    placeholder?: string;
    required?: boolean;
    disabled?: boolean;
    /** Show a clear button while something is selected or typed. */
    clearable?: boolean;
    /** Form field name: hidden inputs carry the value(s) on a native submit. */
    name?: string;
    emptyText?: string;
    loadingText?: string;
    onchange?: (selection: string | null | string[], option: ComboOption | null) => void;
    /** Custom option content: `{#snippet option(o)}…{/snippet}`. */
    option?: Snippet<[ComboOption]>;
    /** Actions under the list ("+ New site"): `{#snippet footer({ query, close })}…{/snippet}`. */
    footer?: Snippet<[{ query: string; close: () => void }]>;
  } & Omit<HTMLInputAttributes, 'value' | 'id' | 'type' | 'onchange'> = $props();

  const propsId = $props.id();
  const uid = `dl-combo-${propsId}`;
  const inputId = $derived(id || `${uid}-input`);
  const listId = `${uid}-list`;
  const optionId = (index: number) => `${uid}-opt-${index}`;

  /** Tallest the list grows, in pixels, before the visual viewport caps it further. */
  const POPUP_MAX = 320;
  /** Smallest cap on the list: a few rows stay reachable even with the keyboard up. */
  const POPUP_MIN = 96;
  /** Below this much room under the input the list opens above it, if there is more room there. */
  const POPUP_FLIP = 200;
  const POPUP_GAP = 4;
  const VIEWPORT_MARGIN = 8;

  let root = $state<HTMLElement>();
  let control = $state<HTMLElement>();
  let input = $state<HTMLInputElement>();
  let expanded = $state(false);
  let typed = $state(false);
  let query = $state('');
  let active = $state(-1);
  let loading = $state(false);
  let remote = $state<ComboOption[]>([]);
  let above = $state(false);
  let maxHeight = $state<number | null>(null);
  let labelId = $state('');
  let pressInside = false;
  let focusClick = false;
  const seen: Record<string, ComboOption> = {};

  function remember(list: readonly ComboOption[]) {
    for (const o of list) if (!(o.value in seen)) seen[o.value] = o;
  }

  const labelOf = (v: string) =>
    options.find((o) => o.value === v)?.label ??
    known.find((o) => o.value === v)?.label ??
    remote.find((o) => o.value === v)?.label ??
    seen[v]?.label ??
    v;

  const selectedLabel = $derived(!multiple && value != null ? labelOf(value) : '');

  $effect(() => {
    if (!multiple && !typed) query = selectedLabel;
  });

  const shown = $derived.by(() => {
    const filterBy = typed ? query : '';
    const base = source ? remote : filterOptions(options, filterBy);
    const visible = multiple ? base.filter((o) => !values.includes(o.value)) : base;
    return flattenGroups(groupOptions(uniqueOptions(visible)));
  });
  const groups = $derived(groupOptions(shown));
  const indexOf = (o: ComboOption) => shown.indexOf(o);

  let timer: ReturnType<typeof setTimeout> | undefined;
  let controller: AbortController | null = null;

  function fetchRemote(text: string, wait: number) {
    if (!source) return;
    clearTimeout(timer);
    controller?.abort();
    if (text.trim().length < minChars) {
      remote = [];
      loading = false;
      return;
    }
    loading = true;
    const run = async () => {
      const ctrl = new AbortController();
      controller = ctrl;
      try {
        const result = await source(text, ctrl.signal);
        if (ctrl.signal.aborted) return;
        remember(result);
        remote = result;
        active = -1;
      } catch {
        if (!ctrl.signal.aborted) remote = [];
      } finally {
        if (controller === ctrl) loading = false;
      }
    };
    if (wait > 0) timer = setTimeout(run, wait);
    else run();
  }

  $effect(() => () => {
    clearTimeout(timer);
    controller?.abort();
  });

  function openList() {
    if (disabled || expanded) return;
    expanded = true;
    if (source) fetchRemote(typed ? query : '', 0);
  }

  function closeList() {
    expanded = false;
    active = -1;
  }

  function choose(o: ComboOption) {
    if (o.disabled) return;
    seen[o.value] = o;
    if (multiple) {
      values = [...values, o.value];
      query = '';
      typed = false;
      onchange?.(values, o);
      if (source) fetchRemote('', 0);
      active = -1;
      return;
    }
    value = o.value;
    typed = false;
    query = o.label;
    closeList();
    onchange?.(value, o);
  }

  function focusInside(): boolean {
    return !!root && root.contains(document.activeElement);
  }

  function removeValue(v: string) {
    const refocus = focusInside();
    values = values.filter((x) => x !== v);
    onchange?.(values, null);
    if (refocus) input?.focus();
  }

  function clear() {
    query = '';
    typed = false;
    if (multiple) {
      if (source && expanded) fetchRemote('', 0);
    } else if (value !== null) {
      value = null;
      onchange?.(null, null);
    }
    input?.focus();
  }

  function oninput(e: Event & { currentTarget: HTMLInputElement }) {
    query = e.currentTarget.value;
    typed = true;
    focusClick = false;
    active = -1;
    if (!expanded) expanded = true;
    if (source) fetchRemote(query, debounce);
    else if (query.trim()) active = moveActive(shown, -1, 'Home');
  }

  function scrollActive() {
    tick().then(() => {
      const el = document.getElementById(optionId(active));
      el?.scrollIntoView?.({ block: 'nearest' });
    });
  }

  function onkeydown(e: KeyboardEvent) {
    switch (e.key) {
      case 'ArrowDown':
      case 'ArrowUp': {
        e.preventDefault();
        if (!expanded) {
          openList();
          const sel = !multiple && value != null ? shown.findIndex((o) => o.value === value) : -1;
          active = sel >= 0 ? sel : moveActive(shown, -1, e.key);
        } else {
          active = moveActive(shown, active, e.key);
        }
        scrollActive();
        return;
      }
      case 'Home':
      case 'End':
        if (expanded && active >= 0) {
          e.preventDefault();
          active = moveActive(shown, active, e.key);
          scrollActive();
        }
        return;
      case 'Enter':
        if (e.isComposing) return;
        e.preventDefault();
        if (!expanded) {
          input?.blur();
          return;
        }
        if (active >= 0 && shown[active]) choose(shown[active]);
        else if (shown.length === 1) choose(shown[0]);
        return;
      case 'Escape':
        if (expanded) {
          e.preventDefault();
          e.stopPropagation();
          closeList();
          return;
        }
        if (query && (multiple || query !== selectedLabel)) {
          e.preventDefault();
          e.stopPropagation();
          query = multiple ? '' : selectedLabel;
          typed = false;
        }
        return;
      case 'Backspace':
        if (multiple && !query && values.length) removeValue(values[values.length - 1]);
        return;
      case 'Tab':
        closeList();
        return;
    }
  }

  /** Close the list and settle what was typed, as when focus leaves the field. */
  function leave() {
    closeList();
    if (!multiple && typed) {
      if (!query.trim() && clearable && value !== null) {
        value = null;
        onchange?.(null, null);
      }
      typed = false;
      query = selectedLabel;
    } else if (multiple && typed) {
      typed = false;
      query = '';
    }
  }

  function onfocusout(e: FocusEvent & { currentTarget: HTMLElement }) {
    const next = e.relatedTarget as Node | null;
    if (next && e.currentTarget.contains(next)) return;
    if (!next && pressInside) return;
    leave();
  }

  /*
   * iOS Safari does not focus a tapped button, so a tap on the list, its
   * footer or the buttons blurs the input (relatedTarget null) before the
   * click arrives. A press that started inside keeps the list; a press
   * outside closes it, also when the input had already lost focus.
   */
  function onWindowPointerdown(e: PointerEvent) {
    const target = e.target as Node | null;
    const inside = !!target && !!root?.contains(target);
    pressInside = inside && target !== input;
    if (!inside && (expanded || typed) && !focusInside()) leave();
    else if (!inside && expanded) closeList();
  }

  function endPress() {
    pressInside = false;
  }

  function onfocus() {
    focusClick = true;
    if (!multiple && !typed && query) input?.select();
  }

  function onInputClick() {
    if (focusClick && !multiple && !typed && query) input?.select();
    focusClick = false;
    openList();
  }

  function place() {
    if (!control) return;
    const vv = window.visualViewport;
    const top = vv?.offsetTop ?? 0;
    const bottom = top + (vv?.height ?? window.innerHeight);
    const rect = control.getBoundingClientRect();
    const room = (edge: number) => edge - POPUP_GAP - VIEWPORT_MARGIN;
    const below = room(bottom - rect.bottom);
    const over = room(rect.top - top);
    above = below < POPUP_FLIP && over > below;
    maxHeight = Math.max(POPUP_MIN, Math.min(POPUP_MAX, above ? over : below));
  }

  $effect(() => {
    if (!expanded || !control) return;
    untrack(place);
    const vv = window.visualViewport;
    vv?.addEventListener('resize', place);
    vv?.addEventListener('scroll', place);
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      vv?.removeEventListener('resize', place);
      vv?.removeEventListener('scroll', place);
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  });

  $effect(() => {
    const el = input?.labels?.[0];
    if (!el) {
      labelId = '';
      return;
    }
    if (!el.id) el.id = `${inputId}-label`;
    labelId = el.id;
  });

  const hasSelection = $derived(multiple ? values.length > 0 : value != null);
  const showClear = $derived(
    clearable && !disabled && (multiple ? query.length > 0 : hasSelection || query.length > 0),
  );
  const activeId = $derived(
    expanded && active >= 0 && shown[active] ? optionId(active) : undefined,
  );
</script>

<svelte:window
  onpointerdowncapture={onWindowPointerdown}
  onpointercancel={endPress}
  onclick={endPress}
/>

<div
  bind:this={root}
  class="dl-combobox"
  class:dl-combobox--multi={multiple}
  class:dl-combobox--disabled={disabled}
  {onfocusout}
>
  <div class="dl-combobox-control" bind:this={control}>
    {#if multiple && values.length}
      <ul class="dl-combobox-chips" aria-label="Selected">
        {#each values as v (v)}
          <li class="dl-combobox-chip">
            <span>{labelOf(v)}</span>
            <button
              type="button"
              class="dl-combobox-chip-remove"
              aria-label="Remove {labelOf(v)}"
              {disabled}
              onmousedown={(e) => e.preventDefault()}
              onclick={() => removeValue(v)}><span aria-hidden="true">×</span></button
            >
          </li>
        {/each}
      </ul>
    {/if}
    <input
      {...rest}
      bind:this={input}
      id={inputId}
      type="text"
      role="combobox"
      autocomplete="off"
      autocorrect="off"
      spellcheck="false"
      enterkeyhint="done"
      aria-label={label || undefined}
      aria-autocomplete="list"
      aria-expanded={expanded}
      aria-controls={listId}
      aria-activedescendant={activeId}
      aria-required={required || undefined}
      required={required && !hasSelection}
      {placeholder}
      {disabled}
      value={query}
      {oninput}
      {onkeydown}
      {onfocus}
      onclick={onInputClick}
      class="dl-combobox-input"
    />
    {#if showClear}
      <button
        type="button"
        class="dl-combobox-clear"
        aria-label={label ? `Clear ${label}` : 'Clear'}
        onmousedown={(e) => e.preventDefault()}
        onclick={clear}><span aria-hidden="true">×</span></button
      >
    {/if}
    <button
      type="button"
      class="dl-combobox-toggle"
      tabindex="-1"
      aria-label={expanded ? 'Hide options' : 'Show options'}
      aria-controls={listId}
      aria-expanded={expanded}
      {disabled}
      onmousedown={(e) => e.preventDefault()}
      onclick={() => {
        if (expanded) closeList();
        else openList();
        input?.focus();
      }}><span aria-hidden="true">▾</span></button
    >
  </div>

  <div
    class="dl-combobox-popup"
    class:dl-combobox-popup--above={above}
    style:max-height={maxHeight === null ? undefined : `${maxHeight}px`}
    hidden={!expanded}
    onmousedown={(e) => e.preventDefault()}
    role="presentation"
  >
    <div
      id={listId}
      role="listbox"
      aria-label={label || undefined}
      aria-labelledby={label ? undefined : labelId || undefined}
      aria-multiselectable={multiple || undefined}
      class="dl-combobox-list"
    >
      {#if expanded}
        {#each groups as g, gi (g.group)}
          {#if g.group}
            <div role="group" aria-labelledby="{uid}-g{gi}">
              <div class="dl-combobox-group" id="{uid}-g{gi}" role="presentation">
                {g.group}
              </div>
              {#each g.options as o (o.value)}
                {@render optionRow(o)}
              {/each}
            </div>
          {:else}
            {#each g.options as o (o.value)}
              {@render optionRow(o)}
            {/each}
          {/if}
        {/each}
      {/if}
    </div>
    {#if expanded && loading}
      <p class="dl-combobox-status" role="status">{loadingText}</p>
    {:else if expanded && !shown.length && (typed || source)}
      <p class="dl-combobox-status" role="status">{emptyText}</p>
    {/if}
    {#if expanded && footer}
      <div class="dl-combobox-footer">{@render footer({ query, close: closeList })}</div>
    {/if}
  </div>

  {#if name}
    {#if multiple}
      {#each values as v (v)}<input type="hidden" {name} value={v} />{/each}
    {:else}
      <input type="hidden" {name} value={value ?? ''} />
    {/if}
  {/if}
</div>

{#snippet optionRow(o: ComboOption)}
  {@const i = indexOf(o)}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <div
    id={optionId(i)}
    role="option"
    class="dl-combobox-option"
    class:active={i === active}
    aria-selected={multiple ? values.includes(o.value) : o.value === value}
    aria-disabled={o.disabled || undefined}
    tabindex="-1"
    onmousedown={(e) => e.preventDefault()}
    onclick={() => choose(o)}
    onmousemove={() => (active = i)}
  >
    {#if optionSnippet}
      {@render optionSnippet(o)}
    {:else}
      <span class="dl-combobox-label">{o.label}</span>
      {#if o.hint}<span class="dl-combobox-hint">{o.hint}</span>{/if}
    {/if}
  </div>
{/snippet}

<style>
  .dl-combobox {
    position: relative;
    width: 100%;
  }
  .dl-combobox-control {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--dl-space-1);
    min-height: 36px;
    padding: 3px var(--dl-space-1) 3px 3px;
    border: 1px solid var(--dl-color-border-control);
    border-radius: var(--dl-radius-sm);
    background: var(--dl-color-surface);
  }
  .dl-combobox-control:focus-within {
    outline: var(--dl-focus-ring);
    outline-offset: var(--dl-focus-offset);
  }
  .dl-combobox:has(input[aria-invalid='true']) .dl-combobox-control {
    border-color: var(--dl-color-danger);
  }
  .dl-combobox--disabled .dl-combobox-control {
    opacity: 0.6;
  }
  .dl-combobox .dl-combobox-input {
    flex: 1 1 8ch;
    min-width: 8ch;
    width: auto;
    border: none;
    background: transparent;
    color: var(--dl-color-text);
    font: inherit;
    font-size: var(--dl-text-base);
    padding: 5px 6px;
  }
  .dl-combobox .dl-combobox-input:focus,
  .dl-combobox .dl-combobox-input:focus-visible {
    outline: none;
  }
  .dl-combobox-input::placeholder {
    color: var(--dl-color-text-faint);
    opacity: 1;
  }
  .dl-combobox-chips {
    display: contents;
    list-style: none;
  }
  .dl-combobox-chip {
    display: inline-flex;
    align-items: center;
    gap: 2px;
    padding: 1px 2px 1px var(--dl-space-2);
    border-radius: 999px;
    background: var(--dl-color-accent-soft);
    border: 1px solid var(--dl-color-accent);
    color: var(--dl-color-text);
    font-size: var(--dl-text-md);
  }
  .dl-combobox-chip-remove,
  .dl-combobox-clear,
  .dl-combobox-toggle {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 24px;
    min-height: 24px;
    padding: 0;
    border: none;
    border-radius: 999px;
    background: none;
    color: var(--dl-color-text-muted);
    font-size: var(--dl-text-lg);
    line-height: 1;
    cursor: pointer;
  }
  .dl-combobox-chip-remove:hover,
  .dl-combobox-clear:hover,
  .dl-combobox-toggle:hover {
    color: var(--dl-color-text);
    background: var(--dl-color-surface-2);
  }
  .dl-combobox-popup {
    position: absolute;
    left: 0;
    right: 0;
    top: calc(100% + var(--dl-space-1));
    z-index: 30;
    max-height: min(320px, 50vh);
    overflow: auto;
    border: 1px solid var(--dl-color-border-strong);
    border-radius: var(--dl-radius-sm);
    background: var(--dl-color-bg-elevated);
    box-shadow: var(--dl-shadow-md);
  }
  .dl-combobox-popup--above {
    top: auto;
    bottom: calc(100% + var(--dl-space-1));
  }
  .dl-combobox-popup[hidden] {
    display: none;
  }
  .dl-combobox-group {
    padding: var(--dl-space-2) 10px var(--dl-space-1);
    font-family: var(--dl-font-mono);
    font-size: var(--dl-text-xs);
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--dl-color-text-faint);
  }
  .dl-combobox-option {
    display: flex;
    flex-direction: column;
    gap: 1px;
    padding: 7px 10px;
    min-height: 32px;
    cursor: pointer;
    font-size: var(--dl-text-base);
    color: var(--dl-color-text);
  }
  .dl-combobox-option.active {
    background: var(--dl-color-accent-soft);
    box-shadow: inset 2px 0 0 var(--dl-color-accent);
  }
  .dl-combobox-option[aria-selected='true'] .dl-combobox-label {
    font-weight: 600;
  }
  .dl-combobox-option[aria-disabled='true'] {
    opacity: 0.5;
    cursor: not-allowed;
  }
  .dl-combobox-hint {
    font-size: var(--dl-text-sm);
    color: var(--dl-color-text-muted);
  }
  .dl-combobox-status {
    margin: 0;
    padding: var(--dl-space-2) 10px;
    font-size: var(--dl-text-md);
    color: var(--dl-color-text-muted);
  }
  .dl-combobox-footer {
    position: sticky;
    bottom: 0;
    display: flex;
    flex-wrap: wrap;
    gap: var(--dl-space-2);
    padding: var(--dl-space-2);
    border-top: 1px solid var(--dl-color-border);
    background: var(--dl-color-bg-elevated);
  }
  @media (pointer: coarse) {
    .dl-combobox .dl-combobox-input {
      font-size: max(16px, 1rem);
    }
    .dl-combobox-chip-remove,
    .dl-combobox-clear,
    .dl-combobox-toggle {
      min-width: var(--dl-tap-min, 44px);
      min-height: var(--dl-tap-min, 44px);
    }
    .dl-combobox-option {
      min-height: var(--dl-tap-min, 44px);
      justify-content: center;
    }
  }
</style>
