<script lang="ts">
  import { tick, untrack } from 'svelte';
  import { page } from '$app/stores';
  import InputBar from '$lib/components/InputBar.svelte';
  import HistoryDropdown from '$lib/components/HistoryDropdown.svelte';
  import ResultCard from '$lib/components/ResultCard.svelte';
  import Skeleton from '$lib/components/Skeleton.svelte';
  import ErrorPanel from '$lib/components/ErrorPanel.svelte';
  import SearchResults from '$lib/components/SearchResults.svelte';
  import ShareButton from '$lib/components/ShareButton.svelte';
  import { convert, search } from '$lib/api/client';
  import { ApiError } from '$lib/api/types';
  import { addHistory } from '$lib/stores/history';
  import { isLink } from '$lib/link';
  import { withViewTransition } from '$lib/viewTransition';
  import type { ConvertResponse, SearchResult } from '$lib/api/types';

  let inputValue = $state('');
  let dropdownOpen = $state(false);
  let loading = $state(false);
  let result: ConvertResponse | null = $state(null);
  let error: ApiError | null = $state(null);
  let matches: SearchResult[] | null = $state(null);
  let currentController: AbortController | null = null;

  async function runConvert(url: string) {
    currentController?.abort();
    const ctrl = new AbortController();
    currentController = ctrl;
    loading = true;
    error = null;
    result = null;
    matches = null;
    inputValue = url;
    try {
      const res = await convert(url, { signal: ctrl.signal });
      if (ctrl.signal.aborted) return;
      result = res;
      addHistory({
        sourceUrl: url,
        title: res.source.title,
        artists: res.source.artists,
        coverUrl: res.source.artwork || null,
        timestamp: Date.now()
      });
    } catch (e) {
      if (ctrl.signal.aborted || (e as DOMException).name === 'AbortError') return;
      error = e instanceof ApiError ? e : new ApiError('server_error', 0, String(e), url);
    } finally {
      if (currentController === ctrl) {
        loading = false;
        currentController = null;
      }
    }
  }

  async function runSearch(query: string) {
    currentController?.abort();
    const ctrl = new AbortController();
    currentController = ctrl;
    loading = true;
    error = null;
    result = null;
    matches = null;
    try {
      const res = await search(query, { signal: ctrl.signal });
      if (ctrl.signal.aborted) return;
      matches = res.results;
    } catch (e) {
      if (ctrl.signal.aborted || (e as DOMException).name === 'AbortError') return;
      error = e instanceof ApiError ? e : new ApiError('server_error', 0, String(e));
    } finally {
      if (currentController === ctrl) {
        loading = false;
        currentController = null;
      }
    }
  }

  function pick(detail: { url: string; thumb?: HTMLElement }) {
    if (detail.thumb) detail.thumb.style.viewTransitionName = 'cover';
    withViewTransition(async () => {
      dropdownOpen = false;
      runConvert(detail.url);
      await tick();
    });
  }

  function onWrapFocusOut(event: FocusEvent) {
    // Close the dropdown only when focus leaves the wrap entirely. Moving
    // focus between the input and a listbox option (or vice versa) stays
    // inside currentTarget, so the dropdown remains open while the user
    // navigates with the keyboard or is about to click a history entry.
    const next = event.relatedTarget as Node | null;
    const wrap = event.currentTarget as HTMLElement;
    if (!next || !wrap.contains(next)) {
      dropdownOpen = false;
    }
  }

  // Android's share sheet fills `text` ("Here's a song for you… https://…")
  // and usually leaves `url` empty.
  function sharedLink(params: URLSearchParams): string | null {
    return params.get('url') || (params.get('text')?.match(/https?:\/\/\S+/)?.[0] ?? null);
  }

  $effect(() => {
    const link = sharedLink($page.url.searchParams);
    if (link) untrack(() => runConvert(link));
  });
</script>

<div class="home">
  <div class="input-wrap" onfocusout={onWrapFocusOut}>
    <InputBar
      bind:value={inputValue}
      disabled={loading}
      onsubmit={(detail) => (isLink(detail.url) ? runConvert(detail.url) : runSearch(detail.url))}
      onfocus={() => (dropdownOpen = true)}
    />
    <HistoryDropdown
      open={dropdownOpen}
      onselect={pick}
      onclose={() => (dropdownOpen = false)}
    />
  </div>

  {#if loading}
    <Skeleton />
  {:else if error}
    {#key error}
      <ErrorPanel {error} />
    {/key}
  {:else if matches}
    <SearchResults results={matches} onselect={pick} />
  {:else if result}
    <ResultCard {result}>
      {#snippet share(res)}
        <ShareButton sourceUrl={res.source.url} title={res.source.title} />
      {/snippet}
    </ResultCard>
  {/if}
</div>

<style>
  .home {
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
  }
  .input-wrap {
    position: relative;
  }
</style>
