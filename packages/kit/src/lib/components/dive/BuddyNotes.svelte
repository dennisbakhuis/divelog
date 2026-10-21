<script lang="ts">
  import { signedOn } from '$lib/core/dive/buddy-notes';
  import { getDivelog } from '$lib/core/dive/context';
  import type { Buddy, BuddyNote } from '$lib/core/dive/types';
  import SignatureImage from './SignatureImage.svelte';

  let {
    notes,
    buddies,
  }: {
    /** The notes to show: the public ones, and a buddy's own on their sign link. */
    notes: readonly BuddyNote[];
    /** The dive's buddies, for the names and person pages. */
    buddies: readonly Buddy[];
  } = $props();

  const { urls } = getDivelog();

  const shown = $derived(
    notes
      .filter((note) => note.comment || note.strokes?.length)
      .map((note) => ({ note, buddy: buddies.find((b) => b.slug === note.person) ?? null })),
  );
</script>

{#if shown.length}
  <section class="dl-buddy-notes" aria-labelledby="dl-buddy-notes-title">
    <h2 id="dl-buddy-notes-title">Buddy notes</h2>
    <ul class="notes">
      {#each shown as { note, buddy } (note.person)}
        {@const name = buddy?.name ?? note.person}
        <li class="note">
          <figure>
            {#if note.strokes?.length}
              <SignatureImage strokes={note.strokes} label="Signature of {name}" />
            {/if}
            {#if note.comment}
              <blockquote class="comment">“{note.comment}”</blockquote>
            {/if}
            <figcaption class="by">
              {#if buddy}<a href={urls.person(buddy.slug)}>{name}</a>{:else}{name}{/if}
              <span class="when dl-num">· signed {signedOn(note.signed_at)}</span>
            </figcaption>
          </figure>
        </li>
      {/each}
    </ul>
  </section>
{/if}

<style>
  .dl-buddy-notes {
    margin-top: 44px;
  }
  h2 {
    font-size: 22px;
    margin-bottom: 14px;
  }
  .notes {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(min(100%, 260px), 1fr));
    gap: 14px;
  }
  .note {
    padding: 14px 16px;
    border: 1px solid var(--dl-color-border);
    border-radius: var(--dl-radius);
    background: var(--dl-color-bg-elevated);
    color: var(--dl-color-text);
  }
  figure {
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .comment {
    margin: 0;
    font-style: italic;
    line-height: 1.5;
  }
  .by {
    font-size: 13px;
    color: var(--dl-color-text-muted);
  }
  .by a {
    color: var(--dl-color-text);
    font-weight: 600;
    text-decoration: none;
  }
  .by a:hover {
    color: var(--dl-color-accent);
  }
</style>
