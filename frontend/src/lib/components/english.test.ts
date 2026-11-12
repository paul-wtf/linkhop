import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { render, fireEvent } from '@testing-library/svelte';
import { localePref } from '$lib/i18n';
import { ApiError } from '$lib/api/types';
import { services } from '$lib/stores/services';
import { preferredService } from '$lib/stores/preferences';
import AutoOpen from './AutoOpen.svelte';
import ErrorPanel from './ErrorPanel.svelte';
import InputBar from './InputBar.svelte';
import Preferences from './Preferences.svelte';
import ResultCard from './ResultCard.svelte';
import ServiceItem from './ServiceItem.svelte';
import ShareButton from './ShareButton.svelte';
import ThemeToggle from './ThemeToggle.svelte';

describe('English interface', () => {
  beforeEach(() => localePref.set('en'));
  afterEach(() => {
    localePref.set('auto');
    preferredService.set(null);
  });

  it('labels the input bar', () => {
    const { getByRole } = render(InputBar);
    expect(getByRole('button', { name: 'Convert' })).toBeInTheDocument();
    expect(getByRole('textbox', { name: 'Streaming link or search' })).toBeInTheDocument();
  });

  it('labels a result row', () => {
    const { getByText } = render(ServiceItem, {
      props: { serviceId: 'tidal', displayName: 'Tidal', result: { status: 'not_found' }, isSource: true }
    });
    expect(getByText('not found')).toBeInTheDocument();
    expect(getByText('source')).toBeInTheDocument();
  });

  it('explains an error', () => {
    const { getByText, getByRole } = render(ErrorPanel, {
      props: { error: new ApiError('invalid_url', 400, 'bad') }
    });
    expect(getByText('Invalid link.')).toBeInTheDocument();
    expect(getByRole('button', { name: 'Copy debug info' })).toBeInTheDocument();
  });

  it('labels share, theme and countdown', () => {
    expect(render(ShareButton, { props: { sourceUrl: 'https://x' } }).getByRole('button', { name: 'Share' })).toBeInTheDocument();
    expect(render(ThemeToggle).getByRole('button', { name: /^Theme: .*click to switch$/ })).toBeInTheDocument();
    expect(render(AutoOpen, { props: { url: 'https://x', serviceName: 'Tidal', navigate: () => {} } })
      .getByText('Continuing to Tidal in 3 …')).toBeInTheDocument();
  });

  it('labels the open button on the card', () => {
    services.set({ tidal: { id: 'tidal', name: 'Tidal', capabilities: ['track'] } });
    preferredService.set('tidal');
    const { getByRole } = render(ResultCard, {
      props: {
        result: {
          source: { service: 'deezer', type: 'track', id: '3', url: 'https://deezer/track/3', title: 'N', artists: [], artwork: '' },
          targets: { tidal: { status: 'ok', url: 'https://tidal/track/2' } },
          cache: { hit: false, ttl_seconds: 60 }
        }
      }
    });
    expect(getByRole('link', { name: 'Open in Tidal' })).toBeInTheDocument();
  });

  it('offers the language in the settings and switches it', async () => {
    const { getByRole, getByLabelText } = render(Preferences);
    await fireEvent.click(getByRole('button', { name: 'Settings' }));
    await fireEvent.change(getByLabelText('Language'), { target: { value: 'de' } });
    expect(getByLabelText('Sprache')).toBeInTheDocument();
    expect(getByRole('button', { name: 'Einstellungen' })).toBeInTheDocument();
  });
});
