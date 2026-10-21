<script lang="ts">
  import { adminApi, adminJson, AdminApiError } from '$lib/core/admin/client';
  import { signedOn, signRequestsMessage, type BuddyRow } from '$lib/core/dive/buddy-notes';
  import { getDivelog } from '$lib/core/dive/context';
  import type {
    BuddyNoteInput,
    SignRequest,
    SignRequestsIn,
    SignRequestsOut,
  } from '$lib/core/dive/types';
  import { confirmDialog } from '$lib/core/ui/confirm.js';
  import { toast } from '$lib/components/stores/toast.svelte';
  import Disclosure from '$lib/components/ui/Disclosure.svelte';
  import SignatureImage from '$lib/components/dive/SignatureImage.svelte';

  let {
    number,
    rows,
    choices,
    draft = false,
    open = $bindable(false),
    onpublic,
    onrequests,
    ondeleted,
  }: {
    /** The saved dive's number. */
    number: number;
    /** The dive's buddies with their notes and requests, in the dive's order. */
    rows: BuddyRow[];
    /** The form's `public` choices per note, saved with the form. */
    choices: readonly BuddyNoteInput[];
    /** A draft cannot be sent for signing, so Resend is off. */
    draft?: boolean;
    open?: boolean;
    /** The owner switched a note's `public`; the form saves it. */
    onpublic: (person: string, value: boolean) => void;
    /** The requests after a Resend or a Withdraw. */
    onrequests: (requests: SignRequest[]) => void;
    /** A note was deleted on the server. */
    ondeleted: (person: string) => void;
  } = $props();

  const { urls } = getDivelog();

  let busy = $state<string | null>(null);

  const notes = $derived(rows.filter((row) => row.note).length);

  function isPublic(row: BuddyRow): boolean {
    return choices.find((c) => c.person === row.slug)?.public ?? row.note?.public ?? false;
  }

  function stateLine(row: BuddyRow): string {
    const sent = row.request?.sent_at;
    const expires = row.request?.expires_at;
    switch (row.state) {
      case 'signed':
        return row.note ? `signed on ${signedOn(row.note.signed_at)}` : 'signed';
      case 'open':
        return `asked on ${sent ? signedOn(sent) : '?'}${expires ? `, expires on ${signedOn(expires)}` : ''}`;
      case 'expired':
        return expires && new Date(expires) <= new Date()
          ? `asked on ${sent ? signedOn(sent) : '?'}, expired on ${signedOn(expires)}`
          : `asked on ${sent ? signedOn(sent) : '?'}; the link no longer signs`;
      case 'no_email':
        return 'no e-mail address';
      default:
        return 'not asked';
    }
  }

  function failed(what: string, err: unknown) {
    toast.show({
      kind: 'error',
      message: `${what} failed: ${err instanceof AdminApiError ? err.message : 'no answer'}`,
    });
  }

  async function resend(row: BuddyRow) {
    busy = row.slug;
    try {
      const body: SignRequestsIn = { people: [row.slug], resend: true };
      const result = await adminJson<SignRequestsOut>(
        adminApi('dives', number, 'sign-requests'),
        'POST',
        body,
      );
      onrequests(result.sign_requests);
      toast.show(
        result.sent.includes(row.slug)
          ? { kind: 'success', message: `Sent to ${row.name} again` }
          : signRequestsMessage(result, (slug) => (slug === row.slug ? row.name : slug)),
      );
    } catch (err) {
      failed('Resending', err);
    } finally {
      busy = null;
    }
  }

  async function withdraw(row: BuddyRow) {
    const ok = await confirmDialog({
      title: `Withdraw the request to ${row.name}?`,
      body: 'The mailed link stops working. Asking again sends a new one.',
      confirmLabel: 'Withdraw',
    });
    if (!ok) return;
    busy = row.slug;
    try {
      await adminJson(adminApi('dives', number, 'sign-requests', row.slug), 'DELETE');
      onrequests(
        rows.flatMap((r) =>
          r.request
            ? [
                r.slug === row.slug
                  ? {
                      ...r.request,
                      state: r.email ? ('none' as const) : ('no_email' as const),
                      sent_at: null,
                      expires_at: null,
                    }
                  : r.request,
              ]
            : [],
        ),
      );
      toast.show({ kind: 'success', message: `Request to ${row.name} withdrawn` });
    } catch (err) {
      failed('Withdrawing', err);
    } finally {
      busy = null;
    }
  }

  async function remove(row: BuddyRow) {
    const ok = await confirmDialog({
      title: `Delete ${row.name}'s note?`,
      body: 'The comment and the signature are removed from the dive. This cannot be undone here.',
      confirmLabel: 'Delete',
      danger: true,
    });
    if (!ok) return;
    busy = row.slug;
    try {
      await adminJson(adminApi('dives', number, 'buddy-notes', row.slug), 'DELETE');
      ondeleted(row.slug);
      toast.show({ kind: 'success', message: `${row.name}'s note deleted` });
    } catch (err) {
      failed('Deleting the note', err);
    } finally {
      busy = null;
    }
  }
</script>

<Disclosure
  summary="Buddy notes"
  bind:open
  persistKey="dive-form-buddy-notes"
  count={notes || null}
  class="section"
>
  <div class="dl-buddy-notes-panel" data-section="buddy-notes">
    <p class="muted">
      Buddies sign through the link they get by e-mail. Their notes show on the dive page when
      public.
    </p>
    <ul class="rows">
      {#each rows as row (row.id)}
        <li class="row" data-state={row.state}>
          <div class="who">
            <a href={urls.admin.person(encodeURIComponent(row.id))}>{row.name}</a>
            <span class="state">{stateLine(row)}</span>
            {#if row.state === 'no_email'}
              <a class="add" href={urls.admin.person(encodeURIComponent(row.id))}
                >Add an e-mail address <span class="dl-visually-hidden">for {row.name}</span></a
              >
            {/if}
          </div>
          {#if row.note}
            <div class="note">
              {#if row.note.strokes?.length}
                <SignatureImage
                  strokes={row.note.strokes}
                  label="Signature of {row.name}"
                  width={160}
                />
              {/if}
              {#if row.note.comment}<p class="comment">“{row.note.comment}”</p>{/if}
            </div>
          {/if}
          <div class="actions">
            {#if row.note}
              <label class="check">
                <input
                  type="checkbox"
                  checked={isPublic(row)}
                  disabled={busy === row.slug}
                  onchange={(e) => onpublic(row.slug, e.currentTarget.checked)}
                />
                Public<span class="dl-visually-hidden"
                  >: show {row.name}'s note on the dive page</span
                >
              </label>
              <button
                type="button"
                class="dl-btn dl-btn-ghost dl-btn-sm danger"
                disabled={busy === row.slug}
                onclick={() => remove(row)}
                >Delete <span class="dl-visually-hidden">{row.name}'s note</span></button
              >
            {:else if row.state === 'open' || row.state === 'expired'}
              <button
                type="button"
                class="dl-btn dl-btn-ghost dl-btn-sm"
                disabled={busy === row.slug || draft}
                onclick={() => resend(row)}
                >Resend <span class="dl-visually-hidden">to {row.name}</span></button
              >
              {#if row.state === 'open'}
                <button
                  type="button"
                  class="dl-btn dl-btn-ghost dl-btn-sm"
                  disabled={busy === row.slug}
                  onclick={() => withdraw(row)}
                  >Withdraw <span class="dl-visually-hidden">the request to {row.name}</span
                  ></button
                >
              {/if}
            {/if}
          </div>
        </li>
      {/each}
    </ul>
  </div>
</Disclosure>

<style>
  .dl-buddy-notes-panel {
    display: flex;
    flex-direction: column;
    gap: var(--dl-space-3, 12px);
  }
  .muted {
    color: var(--dl-color-text-faint);
    font-size: var(--dl-text-sm);
    margin: 0;
  }
  .rows {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: var(--dl-space-3, 12px);
  }
  .row {
    display: flex;
    flex-direction: column;
    gap: var(--dl-space-2, 8px);
    padding-bottom: var(--dl-space-3, 12px);
    border-bottom: 1px solid var(--dl-color-border);
  }
  .row:last-child {
    border-bottom: none;
    padding-bottom: 0;
  }
  .who {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 4px 10px;
  }
  .who > a:first-child {
    font-weight: 600;
  }
  .state {
    font-size: var(--dl-text-sm);
    color: var(--dl-color-text-muted);
  }
  [data-state='signed'] .state {
    color: var(--dl-color-accent);
  }
  .add {
    font-size: var(--dl-text-sm);
  }
  .note {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--dl-space-3, 12px);
  }
  .comment {
    margin: 0;
    font-style: italic;
  }
  .actions {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--dl-space-2, 8px);
  }
  .actions:empty {
    display: none;
  }
  .check {
    display: inline-flex;
    flex-direction: row !important;
    align-items: center;
    gap: 6px;
    min-height: 32px;
  }
  .danger:hover {
    color: var(--dl-color-danger);
  }
  @media (pointer: coarse) {
    .check,
    .actions .dl-btn {
      min-height: var(--dl-tap-min, 44px);
    }
  }
</style>
