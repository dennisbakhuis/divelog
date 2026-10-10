<script lang="ts">
  import { onMount } from 'svelte';

  let {
    target = 'dl-main',
    label = 'Skip to content',
  }: {
    /** Id of the element to jump to; it needs `tabindex="-1"` to take focus. */
    target?: string;
    label?: string;
  } = $props();

  let available = $state(false);

  onMount(() => {
    available = !!document.getElementById(target);
  });

  function onclick(e: MouseEvent) {
    const el = document.getElementById(target);
    if (!el) return;
    e.preventDefault();
    if (!el.hasAttribute('tabindex')) el.setAttribute('tabindex', '-1');
    el.focus();
    el.scrollIntoView?.({ block: 'start' });
  }

  function onfocus() {
    available = !!document.getElementById(target);
  }
</script>

{#if available}
  <a class="dl-skip-link" href="#{target}" {onclick} {onfocus}>{label}</a>
{/if}
