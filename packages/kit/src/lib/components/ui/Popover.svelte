<script lang="ts" module>
  import type { Attachment } from 'svelte/attachments';


  /** Attributes for the element that opens a popover; spread them on a `<button>`. */
  export interface PopoverTriggerProps {
    type: 'button';
    'aria-expanded': boolean;
    'aria-controls': string;
    'aria-haspopup': 'dialog' | 'true';
    onclick: (event: MouseEvent) => void;
    [key: symbol]: Attachment<HTMLElement>;
  }
</script>

<script lang="ts">
  import type { Snippet } from 'svelte';
  import { tick } from 'svelte';
  import { createAttachmentKey } from 'svelte/attachments';

  let {
    open = $bindable(false),
    label,
    id = '',
    role = 'dialog',
    focus = 'panel',
    class: className = '',
    onclose,
    trigger,
    children,
  }: {
    open?: boolean;
    /** Accessible name of the panel. */
    label: string;
    /** Id of the panel; generated when empty. */
    id?: string;
    /** `dialog` (the default) for content with links and buttons, `group` for plain text. */
    role?: 'dialog' | 'group' | 'region';
    /** On open, focus the panel itself or its first control. */
    focus?: 'panel' | 'first' | 'none';
    /** Classes of the panel; position it against the caller's relative container. */
    class?: string;
    onclose?: () => void;
    /** The toggle button: `{#snippet trigger(props)}<button {...props}>…</button>{/snippet}`. */
    trigger?: Snippet<[PopoverTriggerProps]>;
    children: Snippet<[{ close: () => void }]>;
  } = $props();

  const propsId = $props.id();
  const uid = `dl-popover-${propsId}`;
  const panelId = $derived(id || uid);
  let panel = $state<HTMLElement>();
  let triggerEl: HTMLElement | null = null;
  let opener: HTMLElement | null = null;
  let wasOpen = false;

  const attach = createAttachmentKey();

  const triggerProps = $derived<PopoverTriggerProps>({
    type: 'button',
    'aria-expanded': open,
    'aria-controls': panelId,
    'aria-haspopup': role === 'dialog' ? 'dialog' : 'true',
    onclick: () => (open = !open),
    [attach]: (node: HTMLElement) => {
      triggerEl = node;
      return () => {
        if (triggerEl === node) triggerEl = null;
      };
    },
  });

  $effect(() => {
    if (open && !wasOpen) {
      wasOpen = true;
      const active = document.activeElement;
      opener = triggerEl ?? (active instanceof HTMLElement ? active : null);
      tick().then(() => {
        if (!open || !panel || focus === 'none') return;
        const first =
          focus === 'first'
            ? panel.querySelector<HTMLElement>(
                'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
              )
            : null;
        (first ?? panel).focus();
      });
    } else if (!open && wasOpen) {
      wasOpen = false;
      onclose?.();
    }
  });

  /** Close the popover; with `restore`, focus goes back to the trigger or opener. */
  function close(restore = true) {
    if (!open) return;
    open = false;
    const target = opener;
    opener = null;
    if (restore && target?.isConnected) target.focus();
  }

  function onWindowKeydown(e: KeyboardEvent) {
    if (open && e.key === 'Escape') {
      e.preventDefault();
      close(true);
    }
  }

  function onWindowPointerdown(e: PointerEvent) {
    if (!open) return;
    const target = e.target as Node | null;
    if (!target) return;
    if (panel?.contains(target) || triggerEl?.contains(target)) return;
    close(false);
  }
</script>

<svelte:window onkeydown={onWindowKeydown} onpointerdown={onWindowPointerdown} />

{@render trigger?.(triggerProps)}
{#if open}
  <div
    bind:this={panel}
    id={panelId}
    {role}
    aria-label={label}
    tabindex="-1"
    class="dl-popover {className}"
  >
    {@render children({ close: () => close(true) })}
  </div>
{/if}

<style>
  .dl-popover {
    position: absolute;
    right: 0;
    top: calc(100% + var(--dl-space-2));
    z-index: 20;
    width: max-content;
    max-width: min(420px, calc(100vw - 2 * var(--dl-space-4)));
    max-height: 60vh;
    overflow: auto;
    padding: 10px var(--dl-space-3);
    border: 1px solid var(--dl-color-border);
    border-radius: var(--dl-radius);
    background: var(--dl-color-bg-elevated);
    box-shadow: var(--dl-shadow-md);
    font-size: var(--dl-text-md);
  }
  .dl-popover:focus {
    outline: none;
  }
  .dl-popover:focus-visible {
    outline: var(--dl-focus-ring);
    outline-offset: var(--dl-focus-offset);
  }
</style>
