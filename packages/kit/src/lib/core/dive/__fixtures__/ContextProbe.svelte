<script lang="ts">
  import { getDivelog, type Divelog } from '../context';

  let { onread }: { onread: (divelog: Divelog) => void } = $props();

  // svelte-ignore state_referenced_locally
  onread(getDivelog());
</script>
