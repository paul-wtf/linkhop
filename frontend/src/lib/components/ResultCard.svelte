<script lang="ts">
  import type { ConvertResponse } from '$lib/api/types';
  import { accentFor, hslCss, loadCoverHue, type Hue } from '$lib/coverColor';
  import { preferredLink } from '$lib/preferred';
  import { preferredService } from '$lib/stores/preferences';
  import { services } from '$lib/stores/services';
  import { effectiveTheme } from '$lib/stores/theme';
  import ServiceList from './ServiceList.svelte';

  interface Props {
    result: ConvertResponse;
    share?: import('svelte').Snippet<[ConvertResponse]>;
  }

  let { result, share }: Props = $props();

  let hue: Hue | null = $state(null);
  let tint = $derived(hue ? hslCss(accentFor(hue, $effectiveTheme)) : null);

  $effect(() => {
    const src = result.source.artwork;
    hue = null;
    if (!src) return;
    let stale = false;
    loadCoverHue(src).then((found) => {
      if (!stale) hue = found;
    });
    return () => {
      stale = true;
    };
  });

  $effect(() => {
    if (!tint) return;
    document.documentElement.style.setProperty('--moon', tint);
    return () => document.documentElement.style.removeProperty('--moon');
  });

  let audio: HTMLAudioElement | undefined = $state();
  let playing = $state(false);
  let previewBroken = $state(false);

  async function togglePreview() {
    if (!audio) return;
    if (playing) {
      audio.pause();
      playing = false;
      return;
    }
    try {
      await audio.play();
      playing = true;
    } catch {
      previewBroken = true;
    }
  }

  let openUrl = $derived(preferredLink(result, $preferredService));
  let openName = $derived(
    $preferredService ? ($services[$preferredService]?.name ?? $preferredService) : ''
  );
</script>

<article class="card" style:--accent={tint} style:--accent-text={tint}>
  <div class="stage">
    {#if result.source.artwork}
      <img
        class="cover"
        src={result.source.artwork}
        alt={`Cover: ${result.source.title}`}
        loading="lazy"
      />
    {:else}
      <div class="cover placeholder" aria-hidden="true"></div>
    {/if}
    {#if result.source.preview_url && !previewBroken}
      <audio
        bind:this={audio}
        src={result.source.preview_url}
        preload="none"
        onended={() => (playing = false)}
        onerror={() => (previewBroken = true)}
      ></audio>
      <button
        type="button"
        class="preview"
        aria-label={playing ? 'Hörprobe stoppen' : 'Hörprobe abspielen'}
        onclick={togglePreview}
      >
        <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true">
          {#if playing}
            <rect x="6" y="5" width="4" height="14" rx="1" />
            <rect x="14" y="5" width="4" height="14" rx="1" />
          {:else}
            <path d="M8 5.5v13a1 1 0 0 0 1.5.86l11-6.5a1 1 0 0 0 0-1.72l-11-6.5A1 1 0 0 0 8 5.5Z" />
          {/if}
        </svg>
      </button>
    {/if}
  </div>

  <div class="meta">
    <h2 class="title">{result.source.title}</h2>
    {#if result.source.artists.length}
      <p class="artists">{result.source.artists.join(', ')}</p>
    {/if}

    {#if openUrl}
      <a class="open" href={openUrl} target="_blank" rel="noopener noreferrer">
        In {openName} öffnen
      </a>
    {/if}
    <ServiceList
      sourceService={result.source.service}
      sourceUrl={result.source.url}
      targets={result.targets ?? {}}
    />

    {@render share?.(result)}
  </div>
</article>

<style>
  /* Fenster-Primitiv: opak (base), borderlos, Schatten nur hier — die
     ResultCard ist die einzige freie Card auf der Seite. Der blaue
     Blur-„Bleed" hinter dem Cover war Liquid-Glass-Vokabular und
     entfällt ersatzlos. */
  .card {
    position: relative;
    display: flex;
    gap: 1.25rem;
    padding: 1.25rem;
    background: var(--base);
    border-radius: var(--r-xl);
    box-shadow: var(--shadow-card);
    overflow: hidden;
    animation: card-in var(--dur) var(--ease-spring);
  }
  @keyframes card-in {
    from { opacity: 0; transform: translateY(6px); }
    to   { opacity: 1; transform: translateY(0); }
  }
  .stage {
    position: relative;
    flex-shrink: 0;
    width: 138px;
    height: 138px;
  }
  .cover {
    width: 100%;
    height: 100%;
    border-radius: var(--r-md);
    object-fit: cover;
    background: var(--surface0);
  }
  .placeholder {
    background: var(--surface0);
  }
  .preview {
    position: absolute;
    right: 0.4rem;
    bottom: 0.4rem;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 2.2rem;
    height: 2.2rem;
    padding: 0;
    background: var(--accent-text);
    color: var(--accent-contrast);
    border: 0;
    border-radius: 50%;
    cursor: pointer;
    transition: filter var(--dur-fast) var(--ease-out);
  }
  .preview:hover { filter: brightness(1.12); }
  .meta {
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
    flex: 1;
    min-width: 0;
  }
  .title {
    margin: 0;
    font-family: var(--font-display);
    font-weight: 700;
    font-size: 1.4rem;
    line-height: 1.15;
    letter-spacing: -0.02em;
    color: var(--text);
    overflow-wrap: anywhere;
  }
  .artists {
    margin: 0 0 0.35rem;
    color: var(--text-muted);
    font-size: 0.95rem;
  }

  .open {
    align-self: flex-start;
    margin-top: 0.35rem;
    padding: 0.55rem 1.2rem;
    background: var(--accent-text);
    color: var(--accent-contrast);
    border-radius: var(--r-md);
    font-weight: 700;
    font-size: 0.9rem;
    text-decoration: none;
    transition: filter var(--dur-fast) var(--ease-out);
  }
  .open:hover { filter: brightness(1.12); }
  @media (max-width: 639px) {
    .card { flex-direction: column; align-items: center; text-align: center; padding: 1.1rem; }
    .stage { width: 100%; max-width: 220px; height: auto; aspect-ratio: 1 / 1; }
    .meta { width: 100%; text-align: left; }
  }
</style>
