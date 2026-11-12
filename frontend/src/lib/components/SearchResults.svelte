<script lang="ts">
  import { t, type MessageKey } from '$lib/i18n';
  import type { SearchResult } from '$lib/api/types';

  interface Props {
    results: SearchResult[];
    onselect?: (detail: { url: string; thumb?: HTMLElement }) => void;
  }

  let { results, onselect }: Props = $props();

  const TYPE_LABEL: Record<SearchResult['type'], MessageKey> = {
    track: 'type_track',
    album: 'type_album',
    artist: 'type_artist'
  };

  function select(url: string, event: MouseEvent) {
    const thumb = (event.currentTarget as HTMLElement).querySelector<HTMLElement>('.thumb');
    onselect?.({ url, thumb: thumb ?? undefined });
  }
</script>

<section class="results" aria-label={$t('search_results')}>
  {#if results.length === 0}
    <p class="empty">{$t('search_empty')}</p>
  {:else}
    <ul>
      {#each results as result (result.url)}
        <li>
          <button type="button" class="item" onclick={(event) => select(result.url, event)}>
            {#if result.artwork}
              <img class="thumb" class:round={result.type === 'artist'} src={result.artwork} alt="" loading="lazy" />
            {:else}
              <span class="thumb" class:round={result.type === 'artist'} aria-hidden="true"></span>
            {/if}
            <span class="text">
              <span class="title">{result.title}</span>
              {#if result.type !== 'artist'}
                <span class="artists">{result.artists.join(', ')}</span>
              {/if}
            </span>
            <span class="type">{$t(TYPE_LABEL[result.type])}</span>
          </button>
        </li>
      {/each}
    </ul>
  {/if}
</section>

<style>
  .results {
    padding: 0.5rem;
    background: var(--base);
    border-radius: var(--r-xl);
    box-shadow: var(--shadow-card);
    animation: results-in var(--dur) var(--ease-spring);
  }
  @keyframes results-in {
    from { opacity: 0; transform: translateY(6px); }
    to   { opacity: 1; transform: translateY(0); }
  }
  ul {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
  }
  .item {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    width: 100%;
    padding: 0.5rem 0.65rem;
    background: transparent;
    border: 0;
    border-radius: var(--r-md);
    color: var(--text);
    font: inherit;
    text-align: left;
    cursor: pointer;
    transition: background var(--dur-fast) var(--ease-out);
  }
  .item:hover { background: var(--surface0); }
  .thumb {
    flex-shrink: 0;
    width: 2.5rem;
    height: 2.5rem;
    border-radius: var(--r-xs);
    object-fit: cover;
    background: var(--surface0);
  }
  .thumb.round { border-radius: 50%; }
  .text {
    display: flex;
    flex-direction: column;
    flex: 1;
    min-width: 0;
  }
  .title {
    font-weight: 600;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .artists {
    color: var(--text-muted);
    font-size: 0.85rem;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .type {
    flex-shrink: 0;
    font-size: 0.68rem;
    font-weight: 600;
    text-transform: lowercase;
    color: var(--text-muted);
    background: var(--surface0);
    border-radius: var(--r-xs);
    padding: 0.1rem 0.5rem;
  }
  .item:hover .type { background: var(--surface1); }
  .empty {
    margin: 0;
    padding: 0.75rem 0.65rem;
    color: var(--text-muted);
  }
</style>
