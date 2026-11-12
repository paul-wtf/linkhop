<script lang="ts">
  import { t } from '$lib/i18n';
  import { tick } from 'svelte';
  import { history, clearHistory } from '$lib/stores/history';

  interface Props {
    open?: boolean;
    onselect?: (detail: { url: string; thumb?: HTMLElement }) => void;
    onclose?: () => void;
  }

  let { open = false, onselect, onclose }: Props = $props();

  let activeIndex = $state(0);
  let itemButtons: HTMLButtonElement[] = $state([]);

  // Keep activeIndex within bounds when the history list shrinks. When the
  // dropdown closes, reset to 0 so the next open starts fresh.
  $effect(() => {
    if (!open) {
      activeIndex = 0;
    } else if (activeIndex >= $history.length) {
      activeIndex = Math.max(0, $history.length - 1);
    }
  });

  async function focusActive() {
    await tick();
    itemButtons[activeIndex]?.focus();
  }

  function handleKey(event: KeyboardEvent) {
    const len = $history.length;
    if (event.key === 'Escape') {
      event.preventDefault();
      onclose?.();
      return;
    }
    if (!len) return;
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        activeIndex = (activeIndex + 1) % len;
        focusActive();
        break;
      case 'ArrowUp':
        event.preventDefault();
        activeIndex = (activeIndex - 1 + len) % len;
        focusActive();
        break;
      case 'Home':
        event.preventDefault();
        activeIndex = 0;
        focusActive();
        break;
      case 'End':
        event.preventDefault();
        activeIndex = len - 1;
        focusActive();
        break;
    }
  }

  function select(url: string, event: MouseEvent) {
    const thumb = (event.currentTarget as HTMLElement).querySelector<HTMLElement>('.thumb');
    onselect?.({ url, thumb: thumb ?? undefined });
  }

  function truncate(url: string, n = 40) {
    return url.length > n ? url.slice(0, n - 1) + '…' : url;
  }
</script>

{#if open && $history.length > 0}
  <div
    class="dropdown"
    role="listbox"
    aria-label={$t('history')}
    tabindex="-1"
    onkeydown={handleKey}
  >
    <div class="hint">{$t('recent')}</div>
    {#each $history as entry, i (entry.sourceUrl)}
      <button
        bind:this={itemButtons[i]}
        type="button"
        class="item"
        role="option"
        aria-label={entry.title}
        aria-selected={activeIndex === i}
        tabindex={activeIndex === i ? 0 : -1}
        onclick={(event) => select(entry.sourceUrl, event)}
      >
        {#if entry.coverUrl}
          <img class="thumb" src={entry.coverUrl} alt="" loading="lazy" />
        {/if}
        <span class="title">{entry.title}</span>
        {#if entry.artists.length}<span class="artists">— {entry.artists.join(', ')}</span>{/if}
        <span class="url">{truncate(entry.sourceUrl)}</span>
      </button>
    {/each}
    <div class="footer">
      <button type="button" class="clear" onclick={clearHistory}>{$t('clear_history')}</button>
    </div>
  </div>
{/if}

<style>
  /* Modal/Dropdown-Rezept: base, radius 16, Schatten, kein Border. */
  .dropdown {
    position: absolute;
    top: calc(100% + 0.5rem);
    left: 0;
    right: 0;
    z-index: 20;
    padding: 0.4rem;
    background: var(--base);
    border-radius: var(--r-lg);
    box-shadow: var(--shadow-card);
    max-height: 18rem;
    overflow-y: auto;
    animation: drop-in var(--dur-fast) var(--ease-out);
  }
  @keyframes drop-in {
    from { opacity: 0; }
    to   { opacity: 1; }
  }
  .hint {
    font-size: 0.7rem;
    color: var(--text-dim);
    text-transform: lowercase;
    padding: 0.35rem 0.6rem 0.25rem;
  }
  /* Zeilen-Rezept wie Tabellen: transparent in Ruhe, surface0 bei Hover/
     Auswahl — kein Border, keine Farbwäsche. */
  .item {
    display: flex;
    gap: 0.5rem;
    width: 100%;
    align-items: baseline;
    text-align: left;
    padding: 0.55rem 0.65rem;
    border: 0;
    border-radius: var(--r-sm);
    background: transparent;
    color: var(--text);
    cursor: pointer;
    font: inherit;
    transition: background var(--dur-fast) var(--ease-out);
  }
  .item:hover,
  .item[aria-selected='true'] {
    background: var(--surface0);
  }
  .item:focus-visible {
    outline: 2px solid var(--accent-text);
    outline-offset: -2px;
  }
  .thumb {
    align-self: center;
    flex-shrink: 0;
    width: 1.75rem;
    height: 1.75rem;
    border-radius: 5px;
    object-fit: cover;
    background: var(--surface0);
  }
  .title {
    font-weight: 600;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    max-width: 14rem;
  }
  .artists {
    color: var(--text-muted);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    flex: 1;
  }
  .url {
    color: var(--text-dim);
    font-family: var(--font-mono);
    font-size: 0.72rem;
    margin-left: auto;
    flex-shrink: 0;
  }
  .footer {
    margin-top: 0.25rem;
    padding-top: 0.35rem;
    text-align: right;
  }
  .clear {
    background: transparent;
    border: none;
    color: var(--text-muted);
    font: inherit;
    font-size: 0.78rem;
    padding: 0.25rem 0.5rem;
    border-radius: var(--r-xs);
    cursor: pointer;
    transition: color var(--dur-fast) var(--ease-out);
  }
  .clear:hover { color: var(--error); }

  @media (max-width: 520px) {
    .title { max-width: 10rem; }
    .url { display: none; }
  }
</style>
