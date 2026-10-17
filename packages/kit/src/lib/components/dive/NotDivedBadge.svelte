<script lang="ts">
  import { NOT_DIVED } from '$lib/core/dive/sites-filter';
</script>

<span class="dl-tag not-dived" data-dived="no">{NOT_DIVED}</span>

<style>
  .not-dived {
    font-size: 10px;
    padding: 1px 8px;
    color: var(--dl-color-text-muted);
    background: transparent;
    border-style: dashed;
    border-color: var(--dl-color-border-strong);
  }
  .not-dived::before {
    background: transparent;
    border: 1px solid var(--dl-color-text-faint);
    box-sizing: border-box;
  }
</style>
