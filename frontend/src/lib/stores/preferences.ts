import { writable } from 'svelte/store';

const SERVICE_KEY = 'linkhop:preferred';
const AUTO_OPEN_KEY = 'linkhop:auto-open';

function read(key: string): string | null {
  return typeof localStorage === 'undefined' ? null : localStorage.getItem(key);
}

function write(key: string, value: string | null): void {
  if (typeof localStorage === 'undefined') return;
  if (value === null) localStorage.removeItem(key);
  else localStorage.setItem(key, value);
}

export const preferredService = writable<string | null>(read(SERVICE_KEY));
export const autoOpen = writable<boolean>(read(AUTO_OPEN_KEY) === '1');

preferredService.subscribe((id) => write(SERVICE_KEY, id));
autoOpen.subscribe((on) => write(AUTO_OPEN_KEY, on ? '1' : null));
