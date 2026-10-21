<script lang="ts">
  import { adminJson, AdminApiError } from '$lib/core/admin/client';
  import { signedOn } from '$lib/core/dive/buddy-notes';
  import { getDivelog } from '$lib/core/dive/context';
  import { SIGNATURE_LIMITS } from '$lib/core/dive/signature';
  import type { BuddyNote, SignIn, Signer } from '$lib/core/dive/types';
  import { announce } from '$lib/core/ui/announce.js';
  import Field from '$lib/components/ui/Field.svelte';
  import SignaturePad from '$lib/components/ui/SignaturePad.svelte';

  let {
    token,
    signer,
    state: linkState,
    note = null,
    onsigned,
  }: {
    /** The sign token from the mailed link. */
    token: string;
    signer: Signer;
    /** `open`: the box to sign; `used`: the buddy signed already. */
    state: 'open' | 'used';
    /** The buddy's note, once signed. */
    note?: BuddyNote | null;
    /** Called with the stored note after a successful signing. */
    onsigned?: (note: BuddyNote) => void;
  } = $props();

  const { config } = getDivelog();
  const owner = $derived(config.ownerName);

  let comment = $state('');
  let strokes = $state<number[][][]>([]);
  let shown = $state(true);
  let busy = $state(false);
  let error = $state('');
  let signed = $state<BuddyNote | null>(null);
  let commentEl = $state<HTMLTextAreaElement>();

  const left = $derived(SIGNATURE_LIMITS.comment - comment.length);

  function messageFor(err: unknown): string {
    if (!(err instanceof AdminApiError)) return 'Could not reach the dive log; try again.';
    if (err.status === 409) return 'This dive is signed already.';
    if (err.status === 410) return `This sign link has expired; ask ${owner} for a new one.`;
    if (err.status === 429) return 'Too many tries; wait a few minutes and sign again.';
    if (err.status === 422)
      return 'The note was not accepted; shorten the comment or clear the pad.';
    return `Signing failed: ${err.message}`;
  }

  /** Enter closes the phone keyboard instead of starting a new line. */
  function onCommentKey(e: KeyboardEvent & { currentTarget: HTMLTextAreaElement }) {
    if (e.key !== 'Enter' || e.shiftKey || e.isComposing) return;
    e.preventDefault();
    e.currentTarget.blur();
  }

  async function submit(e: SubmitEvent) {
    e.preventDefault();
    if (busy) return;
    const text = comment.trim();
    if (!text && !strokes.length) {
      error = 'Write a comment or draw a signature first.';
      commentEl?.focus();
      announce(error, { assertive: true });
      return;
    }
    busy = true;
    error = '';
    const body: SignIn = {
      comment: text || null,
      strokes: strokes.length ? strokes : null,
      public: shown,
    };
    try {
      const out = await adminJson<{ note: BuddyNote }>(
        `/dive/sign/${encodeURIComponent(token)}`,
        'POST',
        body,
      );
      signed = out.note;
      announce('Thank you, the dive is signed');
      onsigned?.(out.note);
    } catch (err) {
      error = messageFor(err);
      announce(error, { assertive: true });
    } finally {
      busy = false;
    }
  }
</script>

<section class="dl-card dl-sign-box" aria-labelledby="dl-sign-box-title">
  {#if signed}
    <h2 id="dl-sign-box-title" class="title">Thank you, {signer.first_name}</h2>
    <p class="line" role="status">
      {signed.public
        ? 'Your note is on the dive page.'
        : `Your note is kept for ${owner}; visitors of the dive page do not see it.`}
    </p>
  {:else if linkState === 'used'}
    <h2 id="dl-sign-box-title" class="title">
      You signed this dive{note ? ` on ${signedOn(note.signed_at)}` : ''}.
    </h2>
    {#if note && !note.public}
      <p class="line">Your note is kept for {owner}; visitors of the dive page do not see it.</p>
    {/if}
  {:else}
    <h2 id="dl-sign-box-title" class="title">
      Hi {signer.first_name}, {owner} logged this dive with you. Sign it:
    </h2>
    <form class="form" onsubmit={submit} novalidate>
      <Field
        label="Comment"
        id="dl-sign-comment"
        hint={`Optional; ${left} of ${SIGNATURE_LIMITS.comment} characters left.`}
      >
        {#snippet children(c)}
          <textarea
            {...c}
            bind:this={commentEl}
            bind:value={comment}
            rows="2"
            maxlength={SIGNATURE_LIMITS.comment}
            enterkeyhint="done"
            autocomplete="off"
            disabled={busy}
            onkeydown={onCommentKey}
          ></textarea>
        {/snippet}
      </Field>
      <SignaturePad
        bind:value={strokes}
        label="Your signature or a doodle"
        description="Draw with a finger, a pen or the mouse; optional."
        disabled={busy}
      />
      <label class="check">
        <input type="checkbox" bind:checked={shown} disabled={busy} />
        Show my note on the dive page
      </label>
      {#if error}<p class="error" role="alert">{error}</p>{/if}
      <button type="submit" class="dl-btn dl-btn-solid sign" disabled={busy}
        >{busy ? 'Signing…' : 'Sign the dive'}</button
      >
    </form>
  {/if}
</section>

<style>
  .dl-sign-box {
    display: flex;
    flex-direction: column;
    gap: 12px;
    margin: 18px 0 0;
    padding: 16px 18px;
    border-color: var(--dl-color-accent);
  }
  .title {
    margin: 0;
    font-size: 18px;
    line-height: 1.35;
  }
  .line {
    margin: 0;
    color: var(--dl-color-text-muted);
  }
  .form {
    display: flex;
    flex-direction: column;
    gap: 14px;
  }
  textarea {
    width: 100%;
    min-height: 44px;
    resize: vertical;
  }
  .check {
    display: flex;
    align-items: center;
    gap: 10px;
    min-height: 44px;
  }
  .check input {
    width: 20px;
    height: 20px;
  }
  .error {
    margin: 0;
    color: var(--dl-color-danger);
  }
  .sign {
    min-height: 44px;
    align-self: flex-start;
  }
  @media (max-width: 480px) {
    .dl-sign-box {
      padding: 14px 12px;
    }
    .sign {
      align-self: stretch;
    }
  }
</style>
