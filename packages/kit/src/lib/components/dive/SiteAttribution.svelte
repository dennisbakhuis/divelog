<script lang="ts">
  import type { Attribution, SiteOrigin } from '$lib/core/dive/types';
  import { COMMONS_LICENCES, isUrl, shortRef, sourceName } from '$lib/core/dive/sharing';
  import { forkedFromRevision } from '$lib/core/dive/revision';

  let {
    origin,
    attribution = null,
    forkedFrom = null,
    variant = 'site',
  }: {
    origin: SiteOrigin;
    attribution?: Attribution | null;
    /** `commons@<revision>` on a fork. */
    forkedFrom?: string | null;
    /** A whole site record, or one map taken from the commons. */
    variant?: 'site' | 'map';
  } = $props();

  const source = $derived(attribution?.source ?? null);
  const name = $derived(sourceName(source));
  const commit = $derived(shortRef(attribution?.ref));
  const forkRevision = $derived(forkedFromRevision(forkedFrom));
</script>

{#snippet contributors()}
  {#if isUrl(source)}<a href={source} rel="noopener">{name}</a>{:else}{name}{/if} contributors
{/snippet}

{#if origin !== 'log'}
  <p class="dl-attribution" data-variant={variant}>
    {#if variant === 'map'}
      Map © {@render contributors()}, CC BY-SA 4.0
    {:else}
      Site data © {@render contributors()}
      {COMMONS_LICENCES}
    {/if}
    {#if commit}<span class="dl-attribution-ref dl-num">· {commit}</span>{/if}
    {#if variant === 'site' && origin === 'fork'}
      <span class="dl-attribution-fork"
        >· {forkRevision !== null
          ? `Forked from the commons at revision ${forkRevision}`
          : 'Forked from the commons'}</span
      >
    {/if}
  </p>
{/if}
