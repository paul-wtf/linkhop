import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, fireEvent, waitFor } from '@testing-library/svelte';
import ServiceItem from './ServiceItem.svelte';
import type { TargetResult } from '$lib/api/types';

describe('ServiceItem', () => {
  beforeEach(() => {
    // Reset clipboard between tests.
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
      configurable: true,
      writable: true
    });
  });

  it('renders an ok link without ~match badge', () => {
    const result: TargetResult = { status: 'ok', url: 'https://spotify/track/1' };
    const { getByRole, queryByText } = render(ServiceItem, {
      props: { serviceId: 'spotify', displayName: 'Spotify', result }
    });
    expect(getByRole('link').getAttribute('href')).toBe('https://spotify/track/1');
    expect(queryByText(/~match/)).toBeNull();
  });

  it('shows ~match badge for ok_low status', () => {
    const result: TargetResult = { status: 'ok_low', url: 'https://tidal/track/9' };
    const { getByRole, getByText } = render(ServiceItem, {
      props: { serviceId: 'tidal', displayName: 'Tidal', result }
    });
    expect(getByRole('link').getAttribute('href')).toBe('https://tidal/track/9');
    expect(getByText(/~match/)).toBeInTheDocument();
  });

  it('shows "nicht gefunden" for not_found and no link', () => {
    const result: TargetResult = { status: 'not_found' };
    const { getByText, queryByRole } = render(ServiceItem, {
      props: { serviceId: 'deezer', displayName: 'Deezer', result }
    });
    expect(getByText(/nicht gefunden/i)).toBeInTheDocument();
    expect(queryByRole('link')).toBeNull();
  });

  it('shows "Fehler: <message>" when error status carries a message', () => {
    const result: TargetResult = { status: 'error', message: 'boom' };
    const { getByText } = render(ServiceItem, {
      props: { serviceId: 'deezer', displayName: 'Deezer', result }
    });
    expect(getByText('Fehler: boom')).toBeInTheDocument();
  });

  it('shows bare "Fehler" when error status has no message', () => {
    const result: TargetResult = { status: 'error' };
    const { getByText } = render(ServiceItem, {
      props: { serviceId: 'deezer', displayName: 'Deezer', result }
    });
    expect(getByText('Fehler')).toBeInTheDocument();
  });

  it('copy button writes url to clipboard', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
      writable: true
    });
    const result: TargetResult = { status: 'ok', url: 'https://spotify/track/42' };
    const { getByRole } = render(ServiceItem, {
      props: { serviceId: 'spotify', displayName: 'Spotify', result }
    });
    await fireEvent.click(getByRole('button', { name: /link kopieren/i }));
    expect(writeText).toHaveBeenCalledWith('https://spotify/track/42');
  });

  it('shows failure label when clipboard write rejects', async () => {
    const writeText = vi.fn().mockRejectedValue(new Error('denied'));
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
      writable: true
    });
    const result: TargetResult = { status: 'ok', url: 'https://spotify/track/7' };
    const { getByRole, findByText } = render(ServiceItem, {
      props: { serviceId: 'spotify', displayName: 'Spotify', result }
    });
    await fireEvent.click(getByRole('button', { name: /link kopieren/i }));
    await waitFor(() => {
      expect(writeText).toHaveBeenCalled();
    });
    expect(await findByText(/fehlgeschlagen/i)).toBeInTheDocument();
  });

  it('names the matched title for an uncertain match', () => {
    const result: TargetResult = {
      status: 'ok_low', url: 'https://tidal/track/9',
      title: 'Nightcall (Live)', artists: ['Kavinsky', 'Lovefoxxx']
    };
    const { getByText } = render(ServiceItem, {
      props: { serviceId: 'tidal', displayName: 'Tidal', result }
    });
    expect(getByText('Nightcall (Live) · Kavinsky, Lovefoxxx')).toBeInTheDocument();
  });

  it('does not repeat the title for a confident match', () => {
    const result: TargetResult = {
      status: 'ok', url: 'https://tidal/track/9', title: 'Nightcall', artists: ['Kavinsky']
    };
    const { queryByText } = render(ServiceItem, {
      props: { serviceId: 'tidal', displayName: 'Tidal', result }
    });
    expect(queryByText(/Nightcall/)).toBeNull();
  });

  it('draws the logo of a known service', () => {
    const { container } = render(ServiceItem, {
      props: { serviceId: 'apple_music', displayName: 'Apple Music', result: { status: 'not_found' } }
    });
    expect(container.querySelector('svg.service-icon path')?.getAttribute('d')).toBeTruthy();
  });

  it('draws no logo for a service it does not know', () => {
    const { container } = render(ServiceItem, {
      props: { serviceId: 'qobuz', displayName: 'Qobuz', result: { status: 'not_found' } }
    });
    expect(container.querySelector('svg.service-icon')).toBeNull();
  });
});
