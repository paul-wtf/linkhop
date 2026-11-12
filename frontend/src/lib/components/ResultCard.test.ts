import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, fireEvent, waitFor } from '@testing-library/svelte';
import ResultCard from './ResultCard.svelte';
import * as coverColor from '$lib/coverColor';
import { preferredService } from '$lib/stores/preferences';
import { services } from '$lib/stores/services';
import type { ConvertResponse } from '$lib/api/types';

const result: ConvertResponse = {
  source: {
    service: 'deezer', type: 'track', id: '3', url: 'https://deezer/track/3',
    title: 'Nightcall', artists: ['Kavinsky'], artwork: ''
  },
  targets: {
    tidal: { status: 'ok', url: 'https://tidal/track/2' },
    spotify: { status: 'not_found' }
  },
  cache: { hit: false, ttl_seconds: 60 }
};

describe('ResultCard', () => {
  beforeEach(() => {
    preferredService.set(null);
    services.set({ tidal: { id: 'tidal', name: 'Tidal', capabilities: ['track'] } });
  });

  it('offers no open button without a preferred service', () => {
    const { queryByRole } = render(ResultCard, { props: { result } });
    expect(queryByRole('link', { name: /öffnen/i })).toBeNull();
  });

  it('links straight to the preferred service', () => {
    preferredService.set('tidal');
    const { getByRole } = render(ResultCard, { props: { result } });
    expect(getByRole('link', { name: 'In Tidal öffnen' })).toHaveAttribute(
      'href',
      'https://tidal/track/2'
    );
  });

  it('uses the source link when the source is the preferred service', () => {
    preferredService.set('deezer');
    const { getByRole } = render(ResultCard, { props: { result } });
    expect(getByRole('link', { name: /In deezer öffnen/i })).toHaveAttribute(
      'href',
      'https://deezer/track/3'
    );
  });

  it('offers no open button when the preferred service has no match', () => {
    preferredService.set('spotify');
    const { queryByRole } = render(ResultCard, { props: { result } });
    expect(queryByRole('link', { name: /öffnen/i })).toBeNull();
  });

  describe('preview', () => {
    const withPreview: ConvertResponse = {
      ...result,
      source: { ...result.source, preview_url: 'https://preview/x.m4a' }
    };
    let play: ReturnType<typeof vi.spyOn>;
    let pause: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      play = vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
      pause = vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
    });
    afterEach(() => vi.restoreAllMocks());

    it('has no play button without a preview', () => {
      const { queryByRole } = render(ResultCard, { props: { result } });
      expect(queryByRole('button', { name: /Hörprobe/ })).toBeNull();
    });

    it('plays and stops the preview', async () => {
      const { getByRole } = render(ResultCard, { props: { result: withPreview } });
      await fireEvent.click(getByRole('button', { name: 'Hörprobe abspielen' }));
      expect(play).toHaveBeenCalledOnce();
      await fireEvent.click(getByRole('button', { name: 'Hörprobe stoppen' }));
      expect(pause).toHaveBeenCalledOnce();
      expect(getByRole('button', { name: 'Hörprobe abspielen' })).toBeInTheDocument();
    });

    it('removes the button when the audio cannot be loaded', async () => {
      const { container, queryByRole } = render(ResultCard, { props: { result: withPreview } });
      await fireEvent.error(container.querySelector('audio')!);
      expect(queryByRole('button', { name: /Hörprobe/ })).toBeNull();
    });
  });

  describe('cover colour', () => {
    const withCover: ConvertResponse = {
      ...result,
      source: { ...result.source, artwork: 'https://covers/x.jpg' }
    };
    afterEach(() => {
      vi.restoreAllMocks();
      document.documentElement.style.removeProperty('--moon');
    });

    it('tints the card and the moon with the colour of the cover', async () => {
      vi.spyOn(coverColor, 'loadCoverHue').mockResolvedValue({ h: 200, s: 0.6 });
      const { container } = render(ResultCard, { props: { result: withCover } });
      const card = container.querySelector<HTMLElement>('.card')!;
      await waitFor(() => expect(card.style.getPropertyValue('--accent-text')).toMatch(/^hsl\(200/));
      expect(document.documentElement.style.getPropertyValue('--moon')).toMatch(/^hsl\(200/);
    });

    it('keeps the normal accent when the cover gives no colour', async () => {
      const load = vi.spyOn(coverColor, 'loadCoverHue').mockResolvedValue(null);
      const { container } = render(ResultCard, { props: { result: withCover } });
      await waitFor(() => expect(load).toHaveBeenCalledWith('https://covers/x.jpg'));
      expect(container.querySelector<HTMLElement>('.card')!.style.getPropertyValue('--accent-text')).toBe('');
      expect(document.documentElement.style.getPropertyValue('--moon')).toBe('');
    });

    it('gives the moon back when the card goes away', async () => {
      vi.spyOn(coverColor, 'loadCoverHue').mockResolvedValue({ h: 200, s: 0.6 });
      const { unmount } = render(ResultCard, { props: { result: withCover } });
      await waitFor(() =>
        expect(document.documentElement.style.getPropertyValue('--moon')).not.toBe('')
      );
      unmount();
      expect(document.documentElement.style.getPropertyValue('--moon')).toBe('');
    });
  });
});
