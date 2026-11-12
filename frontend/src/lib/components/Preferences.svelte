<script lang="ts">
  import { localePref, t, type LocalePref } from '$lib/i18n';
  import { autoOpen, preferredService } from '$lib/stores/preferences';
  import { services } from '$lib/stores/services';

  let open = $state(false);

  function onFocusOut(event: FocusEvent) {
    const next = event.relatedTarget as Node | null;
    if (!next || !(event.currentTarget as HTMLElement).contains(next)) open = false;
  }

  function onKeyDown(event: KeyboardEvent) {
    if (event.key === 'Escape') open = false;
  }

  function onLanguageChange(event: Event) {
    localePref.set((event.currentTarget as HTMLSelectElement).value as LocalePref);
  }

  function onServiceChange(event: Event) {
    const id = (event.currentTarget as HTMLSelectElement).value || null;
    preferredService.set(id);
    if (!id) autoOpen.set(false);
  }
</script>

<div class="prefs" onfocusout={onFocusOut} onkeydown={onKeyDown} role="presentation">
  <button
    type="button"
    class="trigger"
    aria-label={$t('settings')}
    aria-expanded={open}
    onclick={() => (open = !open)}
  >
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor"
         stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <line x1="4" y1="7" x2="20" y2="7" />
      <line x1="4" y1="17" x2="20" y2="17" />
      <circle cx="9" cy="7" r="2.5" fill="var(--surface0)" />
      <circle cx="15" cy="17" r="2.5" fill="var(--surface0)" />
    </svg>
  </button>

  {#if open}
    <div class="panel">
      <label class="field">
        <span>{$t('my_service')}</span>
        <select value={$preferredService ?? ''} onchange={onServiceChange}>
          <option value="">{$t('none')}</option>
          {#each Object.values($services) as service (service.id)}
            <option value={service.id}>{service.name}</option>
          {/each}
        </select>
      </label>
      <label class="check" class:is-disabled={!$preferredService}>
        <input type="checkbox" bind:checked={$autoOpen} disabled={!$preferredService} />
        <span>{$t('auto_open')}</span>
      </label>
      <label class="field">
        <span>{$t('language')}</span>
        <select value={$localePref} onchange={onLanguageChange}>
          <option value="auto">{$t('language_auto')}</option>
          <option value="de">Deutsch</option>
          <option value="en">English</option>
        </select>
      </label>
    </div>
  {/if}
</div>

<style>
  .prefs { position: relative; }
  .trigger {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 2.4rem;
    height: 2.4rem;
    padding: 0;
    background: var(--surface0);
    border: 0;
    border-radius: 50%;
    color: var(--text);
    cursor: pointer;
    transition: background var(--dur-fast) var(--ease-out),
                color var(--dur-fast) var(--ease-out);
  }
  .trigger:hover,
  .trigger[aria-expanded='true'] {
    background: var(--surface1);
    color: var(--accent-text);
  }
  .trigger:hover circle,
  .trigger[aria-expanded='true'] circle { fill: var(--surface1); }
  .panel {
    position: absolute;
    top: calc(100% + 0.5rem);
    right: 0;
    z-index: 80;
    display: flex;
    flex-direction: column;
    gap: 0.85rem;
    width: max-content;
    max-width: min(20rem, calc(100vw - 2rem));
    padding: 1rem;
    background: var(--base);
    border-radius: var(--r-lg);
    box-shadow: var(--shadow-card);
    font-size: 0.9rem;
  }
  .field {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
    color: var(--text-muted);
  }
  select {
    padding: 0.5rem 0.6rem;
    background: var(--surface0);
    border: 0;
    border-radius: var(--r-md);
    color: var(--text);
    font: inherit;
  }
  .check {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    color: var(--text);
  }
  .check.is-disabled { color: var(--text-dim); }
  input[type='checkbox'] { accent-color: var(--accent-text); }
</style>
