<script lang="ts">
  import type { PublicDataFor } from '../public';
  import OwnerBar from '$lib/components/shell/OwnerBar.svelte';
  import { formatDate, pluralize } from '$lib/core/dive/format';
  import { reveal } from '$lib/components/anim/reveal';
  import { getDivelog } from '$lib/core/dive/context';
  import { copyFor } from '$lib/core/dive/config';

  const { urls, config } = getDivelog();
  const copy = copyFor(config);

  let { data }: { data: PublicDataFor<'gear'> } = $props();
  const current = $derived(data.gear.items.filter((i) => !i.retired));
  const retired = $derived(data.gear.items.filter((i) => i.retired));

  const categories = $derived(
    [...new Set(current.map((i) => i.category))].map((category) => ({
      category,
      items: current.filter((i) => i.category === category),
    })),
  );
</script>

<section class="page dl-container">
  <a class="back" href={urls.log()}>← Dive log</a>
  <p class="dl-kicker">Gear</p>
  <h1>{copy.gearTitle}</h1>
  <p class="lede">{copy.gearLede}</p>

  {#if data.owner}
    <OwnerBar
      edit={{ label: 'Edit gear', href: urls.admin.gear() }}
      actions={[{ label: '+ New dive', href: urls.admin.newDive() }]}
    />
  {/if}

  {#if !data.gear.items.length && !data.gear.setups.length}
    <p class="empty">No gear catalogued yet.</p>
  {/if}

  {#if data.gear.setups.length}
    <div class="setups" use:reveal={{ stagger: 90 }}>
      {#each data.gear.setups as setup (setup.id)}
        <article class="dl-card setup" id={setup.slug} data-reveal>
          <header>
            <h2>{setup.name}</h2>
            <a class="count dl-num" href={urls.filter({ setup: setup.slug })}
              >{pluralize(setup.dive_count, 'dive')} →</a
            >
          </header>
          {#if setup.description_html}
            <!-- eslint-disable-next-line svelte/no-at-html-tags -- sanitised by the backend -->
            <div class="dl-prose">{@html setup.description_html}</div>
          {/if}
          <ul class="setup-items">
            {#each setup.items as item (item.id)}
              <li>
                <a href="#item-{item.id}">{item.name}</a><span class="muted">
                  · {item.brand} {item.model}</span
                >
              </li>
            {/each}
          </ul>
        </article>
      {/each}
    </div>
  {/if}

  {#if current.length}<h2 class="section-title">Items</h2>{/if}
  {#each categories as group (group.category)}
    <section class="category" use:reveal={{ stagger: 60 }}>
      <h3>{group.category}</h3>
      <div class="items">
        {#each group.items as item (item.id)}
          <article class="dl-card item" id="item-{item.id}" data-reveal>
            {#if item.photo_url}
              <img src={item.photo_url} alt={item.name} loading="lazy" />
            {/if}
            <div class="item-body">
              <h4>{item.name}</h4>
              <p class="muted">{item.brand} {item.model}</p>
              <p class="facts dl-num">
                {#if item.acquired}since {formatDate(item.acquired)} ·
                {/if}{pluralize(item.dive_count, 'dive')}
              </p>
              {#if item.notes_html}
                <!-- eslint-disable-next-line svelte/no-at-html-tags -- sanitised by the backend -->
                <div class="dl-prose">{@html item.notes_html}</div>
              {/if}
            </div>
          </article>
        {/each}
      </div>
    </section>
  {/each}

  {#if retired.length}
    <section class="category retired">
      <h3>Past gear</h3>
      <ul>
        {#each retired as item (item.id)}
          <li>
            <strong>{item.name}</strong>
            <span class="muted"
              >{item.brand}
              {item.model} · {formatDate(item.acquired)} – {formatDate(item.retired)} · {pluralize(
                item.dive_count,
                'dive',
              )}</span
            >
          </li>
        {/each}
      </ul>
    </section>
  {/if}
</section>

<style>
  .page {
    padding-top: 40px;
    padding-bottom: var(--dl-space-section);
  }
  .back {
    text-decoration: none;
    color: var(--dl-color-text-muted);
    font-size: 14px;
    display: inline-block;
    margin-bottom: 24px;
  }
  h1 {
    font-size: clamp(34px, 5vw, 52px);
  }
  .empty {
    color: var(--dl-color-text-muted);
    padding: 24px 0;
  }
  .lede {
    color: var(--dl-color-text-muted);
    font-size: 1.1rem;
    max-width: 52ch;
    margin-bottom: 32px;
  }
  .setups {
    display: grid;
    gap: 16px;
    grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
    margin-bottom: 56px;
  }
  .setup {
    padding: 22px;
    background: var(--dl-color-bg-elevated);
  }
  .setup header {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 12px;
    margin-bottom: 8px;
  }
  .setup h2 {
    font-size: 21px;
    margin: 0;
  }
  .count {
    font-size: 13px;
    text-decoration: none;
    white-space: nowrap;
  }
  .setup-items {
    list-style: none;
    padding: 0;
    margin: 8px 0 0;
    font-size: 14.5px;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .setup-items a {
    text-decoration: none;
    color: var(--dl-color-text);
  }
  .setup-items a:hover {
    color: var(--dl-color-accent);
  }
  .section-title {
    font-size: 26px;
  }
  .category {
    margin-top: 28px;
  }
  .category h3 {
    font-family: var(--dl-font-mono);
    font-size: 12px;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--dl-color-text-muted);
    margin-bottom: 12px;
  }
  .items {
    display: grid;
    gap: 12px;
    grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  }
  .item {
    overflow: hidden;
  }
  .item img {
    width: 100%;
    aspect-ratio: 4 / 3;
    object-fit: cover;
  }
  .item-body {
    padding: 16px;
  }
  .item h4 {
    font-size: 17px;
    margin-bottom: 2px;
  }
  .muted {
    color: var(--dl-color-text-muted);
    font-size: 14px;
  }
  .facts {
    font-size: 12.5px;
    color: var(--dl-color-text-faint);
  }
  .retired ul {
    padding-left: 18px;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
</style>
