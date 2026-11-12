<script lang="ts">
  import { onDestroy } from 'svelte';
  import type { TargetResult } from '$lib/api/types';
  import { t } from '$lib/i18n';
  import { createCopyFeedback } from '$lib/stores/copyFeedback';
  import ServiceIcon from './ServiceIcon.svelte';

  interface Props {
    serviceId: string;
    displayName: string;
    result: TargetResult | null;
    index?: number;
    isSource?: boolean;
    isPreferred?: boolean;
  }

  let {
    serviceId,
    displayName,
    result,
    isSource = false,
    isPreferred = false,
    index = 0
  }: Props = $props();

  const feedback = createCopyFeedback();
  const { copied, copyFailed } = feedback;

  async function copy() {
    if (!linkUrl) return;
    await feedback.copy(linkUrl);
  }

  onDestroy(() => feedback.destroy());

  let matched = $derived(
    result?.status === 'ok_low' && result.title
      ? [result.title, result.artists?.join(', ')].filter(Boolean).join(' · ')
      : null
  );
  let linkUrl =
    $derived((result?.status === 'ok' || result?.status === 'ok_low') ? result.url ?? null : null);
</script>

<div
  class="row"
  class:source={isSource}
  data-service-id={serviceId}
  aria-busy={result ? undefined : 'true'}
  style:--i={index}
>
  <div class="name">
    <ServiceIcon id={serviceId} />
    <span class="service-name">{displayName}</span>
    {#if isSource}
      <span class="badge source-badge">{$t('badge_source')}</span>
    {/if}
    {#if isPreferred}
      <span class="badge source-badge">{$t('badge_mine')}</span>
    {/if}
    {#if result?.status === 'ok_low'}
      <span class="badge warn-badge" title={$t('match_inexact')}>~match</span>
    {/if}
  </div>

  <div class="body" class:arrived={result !== null}>
    {#if !result}
      <span class="waiting" aria-hidden="true"></span>
    {:else if linkUrl}
      <div class="target">
        <a class="link" href={linkUrl} target="_blank" rel="noopener noreferrer">
          {linkUrl}
        </a>
        {#if matched}
          <span class="matched" title={$t('matched_title')}>{matched}</span>
        {/if}
      </div>
      <button
        type="button"
        class="copy"
        aria-label={$t('copy_link')}
        onclick={copy}
      >
        {#if $copyFailed}
          {$t('failed')}
        {:else if $copied}
          {$t('copied')}
        {:else}
          {$t('copy')}
        {/if}
      </button>
    {:else if result.status === 'not_found'}
      <span class="muted">{$t('not_found')}</span>
    {:else if result.status === 'error'}
      <span class="error">{$t('error')}{result.message ? `: ${result.message}` : ''}</span>
    {/if}
  </div>
</div>

<style>
  /* Verschachtelte Tile im Tabellen-Rezept: surface0 in Ruhe, surface1
     bei Hover (die nächste Stufe der Palette-Leiter) — kein Border, kein
     Blur, kein diagonaler Gradient-Tint. */
  .row {
    --brand: var(--overlay0);
    position: relative;
    display: flex;
    gap: 0.75rem;
    align-items: center;
    padding: 0.55rem 0.85rem 0.55rem 1.05rem;
    background: var(--surface0);
    border-radius: var(--r-md);
    overflow: hidden;
    transition: background var(--dur-fast) var(--ease-out);
  }
  /* Brand-Strip links — flach, opak, dient allein der Diensterkennung
     (Content, nicht Chrome). */
  .row::before {
    content: '';
    position: absolute;
    inset: 0 auto 0 0;
    width: 3px;
    background: var(--brand);
  }
  .row:hover {
    background: var(--surface1);
  }

  /* Marken-Farben pro Dienst — bleiben als Content-Identität erhalten. */
  .row[data-service-id='spotify'] { --brand: #1ed760; }
  .row[data-service-id='deezer']  { --brand: #a238ff; }
  .row[data-service-id='tidal']   { --brand: #25d1da; }
  .row[data-service-id='youtube_music'] { --brand: #ff0000; }
  .row[data-service-id='apple_music'] { --brand: #fa243c; }
  .name {
    display: flex;
    gap: 0.4rem;
    align-items: center;
    min-width: 8rem;
  }
  .service-name {
    font-weight: 700;
    color: var(--text);
    letter-spacing: -0.005em;
  }
  .badge {
    font-size: 0.68rem;
    padding: 0.1rem 0.5rem;
    border-radius: var(--r-xs);
    font-weight: 600;
    text-transform: lowercase;
    background: var(--surface1);
  }
  .source-badge {
    color: var(--accent-text);
  }
  .warn-badge {
    color: var(--warning);
  }
  .body {
    display: flex;
    gap: 0.5rem;
    align-items: center;
    flex: 1;
    min-width: 0;
  }
  .target {
    display: flex;
    flex-direction: column;
    flex: 1;
    min-width: 0;
  }
  .matched {
    color: var(--warning);
    font-size: 0.78rem;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .link {
    font-family: var(--font-mono);
    font-size: 0.82rem;
    color: var(--text-muted);
    text-decoration: none;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    transition: color var(--dur-fast) var(--ease-out);
  }
  .link:hover { color: var(--accent-text); }
  .copy {
    background: var(--surface1);
    border: 0;
    border-radius: var(--r-md);
    color: var(--text);
    font: inherit;
    font-size: 0.78rem;
    font-weight: 500;
    padding: 0.25rem 0.75rem;
    cursor: pointer;
    transition: color var(--dur-fast) var(--ease-out);
  }
  .copy:hover {
    color: var(--accent-text);
  }
  /* Each row drops in a moment after the one above it, also when all
     results arrive at once from the cache. */
  .body.arrived {
    animation: row-in var(--dur) var(--ease-spring) backwards;
    animation-delay: calc(var(--i) * 45ms);
  }
  @keyframes row-in {
    from { opacity: 0; transform: translateY(-6px); }
    to   { opacity: 1; transform: translateY(0); }
  }
  .waiting {
    flex: 1;
    height: 0.8rem;
    border-radius: var(--r-xs);
    --glint: color-mix(in srgb, var(--surface1), var(--text) 14%);
    background: linear-gradient(100deg, var(--surface1) 40%, var(--glint) 50%, var(--surface1) 60%);
    background-size: 200% 100%;
    animation: waiting 1.4s linear infinite;
  }
  @keyframes waiting {
    from { background-position: 100% 0; }
    to   { background-position: -100% 0; }
  }
  .muted { color: var(--text-dim); font-style: italic; font-size: 0.88rem; }
  .error { color: var(--error); font-size: 0.88rem; }

  @media (max-width: 520px) {
    .row { flex-direction: column; align-items: flex-start; gap: 0.35rem; }
    .body { width: 100%; }
  }
</style>
