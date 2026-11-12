<script lang="ts">
  import { t } from '$lib/i18n';
  interface Props {
    value?: string;
    disabled?: boolean;
    onsubmit?: (detail: { url: string }) => void;
    onfocus?: () => void;
    onblur?: () => void;
  }

  let {
    value = $bindable(''),
    disabled = false,
    onsubmit,
    onfocus,
    onblur
  }: Props = $props();

  function submit() {
    const trimmed = value.trim();
    if (!trimmed) return;
    onsubmit?.({ url: trimmed });
  }

  function onKeyDown(e: KeyboardEvent) {
    if (e.key === 'Enter') submit();
  }

  const LINK = /^(https?:\/\/|spotify:)\S+$/;

  function onPaste(e: ClipboardEvent) {
    const input = e.currentTarget as HTMLInputElement;
    const pasted = e.clipboardData?.getData('text').trim() ?? '';
    const replacesAll = input.selectionStart === 0 && input.selectionEnd === input.value.length;
    if (!replacesAll || !LINK.test(pasted)) return;
    e.preventDefault();
    value = pasted;
    submit();
  }
</script>

<div class="bar" class:is-disabled={disabled}>
  <span class="lead" aria-hidden="true">
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor"
         stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
      <circle cx="11" cy="11" r="7" />
      <line x1="16.2" y1="16.2" x2="21" y2="21" />
    </svg>
  </span>
  <input
    type="url"
    placeholder={$t('input_placeholder')}
    bind:value
    onkeydown={onKeyDown}
    onpaste={onPaste}
    onfocus={() => onfocus?.()}
    onblur={() => onblur?.()}
    aria-label={$t('input_label')}
    {disabled}
  />
  <button type="button" class="go" onclick={submit} {disabled}>{$t('convert')}</button>
</div>

<style>
  /* Input/Select-Rezept: surface0, kein Border, radius 10, Fokus = Akzent-
     Ring statt Border-Farbwechsel + Lift. */
  .bar {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.4rem 0.4rem 0.4rem 1rem;
    background: var(--surface0);
    border-radius: var(--r-md);
    transition: box-shadow var(--dur-fast) var(--ease-out);
  }
  .bar:focus-within {
    box-shadow: 0 0 0 2px var(--accent-text);
  }
  .bar.is-disabled { opacity: 0.75; }
  .lead {
    color: var(--text-dim);
    display: inline-flex;
    transition: color var(--dur-fast) var(--ease-out);
  }
  .bar:focus-within .lead { color: var(--accent-text); }
  input {
    flex: 1;
    min-width: 0;
    padding: 0.65rem 0.25rem;
    font: inherit;
    font-size: 1rem;
    color: var(--text);
    background: transparent;
    border: none;
    outline: none;
  }
  input::placeholder { color: var(--text-dim); }
  .go {
    flex-shrink: 0;
    padding: 0.65rem 1.1rem;
    border: 0;
    border-radius: var(--r-md);
    background: var(--accent-text);
    color: var(--accent-contrast);
    font: inherit;
    font-weight: 700;
    font-size: 0.92rem;
    letter-spacing: 0.01em;
    cursor: pointer;
    transition: filter var(--dur-fast) var(--ease-out);
  }
  .go:not(:disabled):hover { filter: brightness(1.12); }
  .go:not(:disabled):active { filter: brightness(0.95); }
  .go:disabled { opacity: 0.55; cursor: not-allowed; }

  @media (max-width: 520px) {
    .bar { padding: 0.4rem 0.4rem 0.4rem 0.85rem; gap: 0.35rem; }
    .go { padding: 0.6rem 0.9rem; font-size: 0.88rem; }
  }
</style>
