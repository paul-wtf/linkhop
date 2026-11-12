import { derived, writable } from 'svelte/store';

export type Locale = 'de' | 'en';
export type LocalePref = Locale | 'auto';

const de = {
  input_placeholder: 'Spotify-, Deezer-, Tidal-, YouTube-Music- oder Apple-Music-Link einfügen …',
  input_label: 'Streaming-Link',
  convert: 'Konvertieren',
  history: 'Verlauf',
  recent: 'Zuletzt',
  clear_history: 'Verlauf leeren',
  settings: 'Einstellungen',
  my_service: 'Mein Dienst',
  none: 'keiner',
  auto_open: 'Geteilte Links direkt dort öffnen',
  language: 'Sprache',
  language_auto: 'automatisch',
  err_invalid_url: 'Ungültiger Link.',
  err_unsupported_service: 'Dieser Dienst wird nicht unterstützt.',
  err_not_found: 'Kurzlink nicht gefunden.',
  err_rate_limited: "Zu viele Anfragen — versuch's in einer Minute erneut.",
  err_server_error: "Server-Fehler. Versuch's gleich nochmal.",
  err_offline: 'Keine Verbindung zum Server.',
  time: 'Zeit',
  copy_failed: 'Kopieren fehlgeschlagen',
  copied: 'Kopiert',
  copy_debug: 'Debug-Info kopieren',
  cover_alt: 'Cover: {title}',
  preview_play: 'Hörprobe abspielen',
  preview_stop: 'Hörprobe stoppen',
  album: 'Album:',
  open_in: 'In {name} öffnen',
  badge_source: 'quelle',
  badge_mine: 'mein dienst',
  match_inexact: 'Ungenaue Übereinstimmung',
  matched_title: 'Gefundener Titel',
  copy_link: 'Link kopieren',
  failed: 'Fehlgeschlagen',
  copy: 'Kopieren',
  not_found: 'nicht gefunden',
  error: 'Fehler',
  share: 'Teilen',
  creating_link: 'Erzeuge Link …',
  copy_short: 'Kurzlink kopieren',
  qr: 'QR-Code',
  send: 'Senden',
  qr_for: 'QR-Code für {url}',
  share_error: 'Fehler beim Erzeugen des Links',
  retry: 'Nochmal',
  loading: 'Lädt …',
  theme_auto: 'Theme: automatisch, zum Wechseln klicken',
  theme_dark: 'Theme: dunkel, zum Wechseln klicken',
  theme_light: 'Theme: hell, zum Wechseln klicken',
  forward_in: 'Weiter zu {name} in {n} …',
  cancel: 'Abbrechen',
  opens_one: '{n}-mal geöffnet',
  opens_other: '{n}-mal geöffnet'
};

export type MessageKey = keyof typeof de;

const en: Record<MessageKey, string> = {
  input_placeholder: 'Paste a Spotify, Deezer, Tidal, YouTube Music or Apple Music link …',
  input_label: 'Streaming link',
  convert: 'Convert',
  history: 'History',
  recent: 'Recent',
  clear_history: 'Clear history',
  settings: 'Settings',
  my_service: 'My service',
  none: 'none',
  auto_open: 'Open shared links there right away',
  language: 'Language',
  language_auto: 'automatic',
  err_invalid_url: 'Invalid link.',
  err_unsupported_service: 'This service is not supported.',
  err_not_found: 'Short link not found.',
  err_rate_limited: 'Too many requests. Try again in a minute.',
  err_server_error: 'Server error. Try again in a moment.',
  err_offline: 'No connection to the server.',
  time: 'Time',
  copy_failed: 'Copy failed',
  copied: 'Copied',
  copy_debug: 'Copy debug info',
  cover_alt: 'Cover: {title}',
  preview_play: 'Play preview',
  preview_stop: 'Stop preview',
  album: 'Album:',
  open_in: 'Open in {name}',
  badge_source: 'source',
  badge_mine: 'my service',
  match_inexact: 'Inexact match',
  matched_title: 'Matched title',
  copy_link: 'Copy link',
  failed: 'Failed',
  copy: 'Copy',
  not_found: 'not found',
  error: 'Error',
  share: 'Share',
  creating_link: 'Creating link …',
  copy_short: 'Copy short link',
  qr: 'QR code',
  send: 'Send',
  qr_for: 'QR code for {url}',
  share_error: 'Could not create the link',
  retry: 'Retry',
  loading: 'Loading …',
  theme_auto: 'Theme: automatic, click to switch',
  theme_dark: 'Theme: dark, click to switch',
  theme_light: 'Theme: light, click to switch',
  forward_in: 'Continuing to {name} in {n} …',
  cancel: 'Cancel',
  opens_one: 'Opened once',
  opens_other: 'Opened {n} times'
};

const MESSAGES: Record<Locale, Record<MessageKey, string>> = { de, en };
const STORAGE_KEY = 'linkhop:lang';

function browserLocale(): Locale {
  const languages = typeof navigator === 'undefined' ? [] : (navigator.languages ?? []);
  return languages[0]?.toLowerCase().startsWith('de') ? 'de' : 'en';
}

function storedPref(): LocalePref {
  const stored = typeof localStorage === 'undefined' ? null : localStorage.getItem(STORAGE_KEY);
  return stored === 'de' || stored === 'en' ? stored : 'auto';
}

export const localePref = writable<LocalePref>(storedPref());

export const locale = derived(localePref, ($pref): Locale =>
  $pref === 'auto' ? browserLocale() : $pref
);

localePref.subscribe((pref) => {
  if (typeof localStorage === 'undefined') return;
  if (pref === 'auto') localStorage.removeItem(STORAGE_KEY);
  else localStorage.setItem(STORAGE_KEY, pref);
});

locale.subscribe((current) => {
  if (typeof document !== 'undefined') document.documentElement.lang = current;
});

export const t = derived(
  locale,
  ($locale) =>
    (key: MessageKey, params: Record<string, string | number> = {}): string =>
      MESSAGES[$locale][key].replace(/\{(\w+)\}/g, (_, name: string) => String(params[name] ?? ''))
);
