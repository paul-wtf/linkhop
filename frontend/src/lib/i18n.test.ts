import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { get } from 'svelte/store';

function browserLanguages(...languages: string[]) {
  Object.defineProperty(navigator, 'languages', { value: languages, configurable: true });
}

describe('i18n', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.resetModules();
  });
  afterEach(() => browserLanguages('de-DE', 'de'));

  it('speaks German to a browser that prefers German', async () => {
    browserLanguages('de-AT', 'en');
    const { locale, t } = await import('./i18n');
    expect(get(locale)).toBe('de');
    expect(get(t)('convert')).toBe('Konvertieren');
  });

  it('speaks English to everyone else', async () => {
    browserLanguages('fr-FR', 'fr');
    const { locale, t } = await import('./i18n');
    expect(get(locale)).toBe('en');
    expect(get(t)('convert')).toBe('Convert');
  });

  it('lets a stored choice win over the browser', async () => {
    browserLanguages('de-DE');
    localStorage.setItem('linkhop:lang', 'en');
    const { locale } = await import('./i18n');
    expect(get(locale)).toBe('en');
  });

  it('stores a choice, switches at once and sets the document language', async () => {
    browserLanguages('de-DE');
    const { locale, localePref, t } = await import('./i18n');
    localePref.set('en');
    expect(get(locale)).toBe('en');
    expect(get(t)('share')).toBe('Share');
    expect(localStorage.getItem('linkhop:lang')).toBe('en');
    expect(document.documentElement.lang).toBe('en');
  });

  it('goes back to the browser language on "auto"', async () => {
    browserLanguages('de-DE');
    localStorage.setItem('linkhop:lang', 'en');
    const { locale, localePref } = await import('./i18n');
    localePref.set('auto');
    expect(get(locale)).toBe('de');
    expect(localStorage.getItem('linkhop:lang')).toBeNull();
  });

  it('fills in parameters', async () => {
    browserLanguages('en-GB');
    const { t } = await import('./i18n');
    expect(get(t)('open_in', { name: 'Tidal' })).toBe('Open in Tidal');
    expect(get(t)('forward_in', { name: 'Tidal', n: 3 })).toBe('Continuing to Tidal in 3 …');
  });
});
