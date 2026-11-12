<script lang="ts">
  import { onDestroy, untrack } from 'svelte';

  interface Props {
    url: string;
    serviceName: string;
    seconds?: number;
    navigate?: (url: string) => void;
  }

  let {
    url,
    serviceName,
    seconds = 3,
    navigate = (target: string) => window.location.assign(target)
  }: Props = $props();

  let remaining = $state(untrack(() => seconds));
  let cancelled = $state(false);

  const timer = setInterval(() => {
    remaining -= 1;
    if (remaining <= 0) {
      clearInterval(timer);
      navigate(url);
    }
  }, 1000);

  function cancel() {
    clearInterval(timer);
    cancelled = true;
  }

  onDestroy(() => clearInterval(timer));
</script>

{#if !cancelled}
  <div class="auto-open" role="status">
    <span>Weiter zu {serviceName} in {Math.max(remaining, 0)} …</span>
    <button type="button" onclick={cancel}>Abbrechen</button>
  </div>
{/if}

<style>
  .auto-open {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
    padding: 0.6rem 0.6rem 0.6rem 1rem;
    background: var(--surface0);
    border-radius: var(--r-md);
    color: var(--text);
    font-size: 0.92rem;
  }
  button {
    background: var(--surface1);
    border: 0;
    border-radius: var(--r-md);
    color: var(--text);
    font: inherit;
    font-size: 0.82rem;
    font-weight: 500;
    padding: 0.35rem 0.85rem;
    cursor: pointer;
    transition: color var(--dur-fast) var(--ease-out);
  }
  button:hover { color: var(--accent-text); }
</style>
