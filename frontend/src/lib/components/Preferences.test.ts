import { beforeEach, describe, expect, it } from 'vitest';
import { get } from 'svelte/store';
import { render, fireEvent } from '@testing-library/svelte';
import Preferences from './Preferences.svelte';
import { autoOpen, preferredService } from '$lib/stores/preferences';
import { services } from '$lib/stores/services';

describe('Preferences', () => {
  beforeEach(() => {
    preferredService.set(null);
    autoOpen.set(false);
    services.set({
      spotify: { id: 'spotify', name: 'Spotify', capabilities: ['track'] },
      tidal: { id: 'tidal', name: 'Tidal', capabilities: ['track'] }
    });
  });

  it('is closed until the button is clicked', async () => {
    const { getByRole, queryByLabelText } = render(Preferences);
    expect(queryByLabelText('Mein Dienst')).toBeNull();
    await fireEvent.click(getByRole('button', { name: 'Einstellungen' }));
    expect(queryByLabelText('Mein Dienst')).not.toBeNull();
  });

  it('stores the chosen service', async () => {
    const { getByRole, getByLabelText } = render(Preferences);
    await fireEvent.click(getByRole('button', { name: 'Einstellungen' }));
    await fireEvent.change(getByLabelText('Mein Dienst'), { target: { value: 'tidal' } });
    expect(get(preferredService)).toBe('tidal');
  });

  it('only offers auto-open once a service is chosen', async () => {
    const { getByRole, getByLabelText } = render(Preferences);
    await fireEvent.click(getByRole('button', { name: 'Einstellungen' }));
    const box = getByLabelText('Geteilte Links direkt dort öffnen') as HTMLInputElement;
    expect(box.disabled).toBe(true);
    await fireEvent.change(getByLabelText('Mein Dienst'), { target: { value: 'tidal' } });
    expect(box.disabled).toBe(false);
    await fireEvent.click(box);
    expect(get(autoOpen)).toBe(true);
  });
});
