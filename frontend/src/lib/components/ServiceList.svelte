<script lang="ts">
  import type { ConvertResponse, TargetResult } from '$lib/api/types';
  import { preferredService } from '$lib/stores/preferences';
  import { services } from '$lib/stores/services';
  import ServiceItem from './ServiceItem.svelte';

  interface Props {
    sourceService: string;
    sourceUrl: string;
    targets: ConvertResponse['targets'];
    pending?: string[];
  }

  let { sourceService, sourceUrl, targets, pending = [] }: Props = $props();

  function displayName(id: string): string {
    return $services[id]?.name ?? id;
  }

  let sourceResult = $derived({ status: 'ok', url: sourceUrl } satisfies TargetResult);
  let targetEntries = $derived(
    [...new Set([...pending, ...Object.keys(targets)])]
      .filter((id) => id !== sourceService)
      .sort((a, b) => Number(b === $preferredService) - Number(a === $preferredService))
      .map((id): [string, TargetResult | null] => [id, targets[id] ?? null])
  );
</script>

<div class="list">
  <ServiceItem
    serviceId={sourceService}
    displayName={displayName(sourceService)}
    result={sourceResult}
    isSource
    isPreferred={sourceService === $preferredService}
  />
  {#each targetEntries as [id, result], i (id)}
    <ServiceItem
      serviceId={id}
      displayName={displayName(id)}
      {result}
      index={i + 1}
      isPreferred={id === $preferredService}
    />
  {/each}
</div>

<style>
  .list {
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
    margin-top: 0.85rem;
  }
</style>
