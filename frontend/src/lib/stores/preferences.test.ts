import { beforeEach, describe, expect, it, vi } from 'vitest';
import { get } from 'svelte/store';

describe('preferences store', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.resetModules();
  });

  it('starts without a preferred service and with auto-open off', async () => {
    const { preferredService, autoOpen } = await import('./preferences');
    expect(get(preferredService)).toBeNull();
    expect(get(autoOpen)).toBe(false);
  });

  it('persists the preferred service', async () => {
    const { preferredService } = await import('./preferences');
    preferredService.set('tidal');
    expect(localStorage.getItem('linkhop:preferred')).toBe('tidal');
  });

  it('removes the stored service when it is cleared', async () => {
    const { preferredService } = await import('./preferences');
    preferredService.set('tidal');
    preferredService.set(null);
    expect(localStorage.getItem('linkhop:preferred')).toBeNull();
  });

  it('reads both settings back', async () => {
    localStorage.setItem('linkhop:preferred', 'deezer');
    localStorage.setItem('linkhop:auto-open', '1');
    const { preferredService, autoOpen } = await import('./preferences');
    expect(get(preferredService)).toBe('deezer');
    expect(get(autoOpen)).toBe(true);
  });
});
