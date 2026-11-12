<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/stores';
  import ResultCard from '$lib/components/ResultCard.svelte';
  import Skeleton from '$lib/components/Skeleton.svelte';
  import ErrorPanel from '$lib/components/ErrorPanel.svelte';
  import AutoOpen from '$lib/components/AutoOpen.svelte';
  import { preferredLink } from '$lib/preferred';
  import { autoOpen, preferredService } from '$lib/stores/preferences';
  import { services } from '$lib/stores/services';
  import { lookup } from '$lib/api/client';
  import { ApiError } from '$lib/api/types';
  import type { ConvertResponse } from '$lib/api/types';

  let loading = $state(true);
  let result: ConvertResponse | null = $state(null);
  let error: ApiError | null = $state(null);

  onMount(async () => {
    // Route matcher /c/[shortId] guarantees a non-empty string here.
    const shortId = $page.params.shortId!;
    try {
      result = await lookup(shortId);
    } catch (e) {
      error = e instanceof ApiError ? e : new ApiError('server_error', 0, String(e));
    } finally {
      loading = false;
    }
  });
</script>

<div class="lookup">
  {#if loading}
    <Skeleton />
  {:else if error}
    {#key error}
      <ErrorPanel {error} />
    {/key}
  {:else if result}
    {@const openUrl = $autoOpen ? preferredLink(result, $preferredService) : null}
    {#if openUrl && $preferredService}
      <AutoOpen url={openUrl} serviceName={$services[$preferredService]?.name ?? $preferredService} />
    {/if}
    <ResultCard {result} />
    {#if result.opens}
      <p class="opens">{result.opens}-mal geöffnet</p>
    {/if}
  {/if}
</div>

<style>
  .lookup {
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
  }
  .opens {
    margin: -0.75rem 0 0;
    color: var(--text-dim);
    font-size: 0.82rem;
    text-align: right;
  }
</style>
