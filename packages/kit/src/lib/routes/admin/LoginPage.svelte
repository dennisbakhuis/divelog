<script lang="ts">
  import { page } from '$app/state';
  import { adminJson, AdminApiError } from '$lib/core/admin/client';

  let email = $state('');
  let sent = $state(false);
  let error = $state('');
  let busy = $state(false);

  async function submit(e: SubmitEvent) {
    e.preventDefault();
    busy = true;
    error = '';
    try {
      await adminJson('/auth/magic-link', 'POST', { email });
      sent = true;
    } catch (err) {
      error = err instanceof AdminApiError ? err.message : 'Could not send the link';
    } finally {
      busy = false;
    }
  }
</script>

<section class="login">
  <div class="dl-card box">
    <p class="dl-kicker">Admin</p>
    <h1>Sign in</h1>
    {#if page.url.searchParams.get('error') === 'expired'}
      <p class="error">That link has expired or was already used. Request a new one.</p>
    {/if}
    {#if sent}
      <p>
        If that address is the owner's, a sign-in link is on its way. It is valid for 15 minutes.
      </p>
      <p class="hint">
        Running locally? The mail lands in <a
          href="http://localhost:8325"
          target="_blank"
          rel="noopener">Mailpit</a
        >.
      </p>
    {:else}
      <form onsubmit={submit}>
        <label>
          E-mail
          <input type="email" autocomplete="email" bind:value={email} required />
        </label>
        {#if error}<p class="error">{error}</p>{/if}
        <button type="submit" class="dl-btn dl-btn-solid" disabled={busy}
          >{busy ? 'Sending…' : 'Send me a link'}</button
        >
      </form>
    {/if}
  </div>
</section>

<style>
  .login {
    min-height: 80svh;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .box {
    width: min(420px, 100%);
    padding: 32px;
    background: var(--dl-color-bg-elevated);
  }
  form {
    display: flex;
    flex-direction: column;
    gap: 14px;
  }
  .hint {
    font-size: 13px;
    color: var(--dl-color-text-faint);
  }
</style>
