<script lang="ts">
  import { DivelogProvider } from '@divelog/kit';
  import { DiveTile } from '@divelog/kit/widgets';

  let { data } = $props();
</script>

<section class="home">
  <h1>{data.divelogConfig.siteName}</h1>
  <p class="lead">
    A reference site for <code>@divelog/kit</code>: the log of {data.divelogConfig.ownerName},
    served by a divelog server.
  </p>
  <DivelogProvider config={data.divelogConfig}>
    <DiveTile summary={data.summary} timeline={data.timeline} />
  </DivelogProvider>
  <p><a class="open" href="/dive">Open the dive log →</a></p>
</section>

<style>
  .home {
    max-width: 640px;
    margin: 0 auto;
    padding: 48px var(--space-page-x);
    display: grid;
    gap: 24px;
  }

  h1 {
    margin: 0;
    font-family: var(--font-display);
  }

  .lead {
    margin: 0;
    color: var(--color-text-muted);
  }
</style>
