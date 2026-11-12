import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, waitFor, fireEvent } from '@testing-library/svelte';
import type { ConvertResponse } from '$lib/api/types';

const { page } = vi.hoisted(() => ({ page: { set: (_: { url: URL }) => {} } }));
vi.mock('$app/stores', async () => {
  const { writable: w } = await import('svelte/store');
  const store = w({ url: new URL('http://localhost/') });
  page.set = store.set;
  return { page: store };
});

const convert = vi.fn();
const search = vi.fn();
vi.mock('$lib/api/client', () => ({
  convert: (url: string, opts: unknown) => convert(url, opts),
  convertStream: (url: string, opts: unknown) => convert(url, opts),
  search: (query: string, opts: unknown) => search(query, opts),
  services: vi.fn()
}));

import Page from './+page.svelte';

function response(title: string): ConvertResponse {
  return {
    source: { service: 'deezer', type: 'track', id: '3', url: 'https://deezer/track/3', title, artists: [], artwork: '' },
    targets: {},
    cache: { hit: false, ttl_seconds: 60 }
  };
}

describe('home page', () => {
  beforeEach(() => {
    localStorage.clear();
    convert.mockReset();
    search.mockReset();
    page.set({ url: new URL('http://localhost/') });
  });

  it('converts nothing without a url parameter', () => {
    render(Page);
    expect(convert).not.toHaveBeenCalled();
  });

  it('converts the url parameter on load', async () => {
    convert.mockResolvedValue(response('Nightcall'));
    page.set({ url: new URL('http://localhost/?url=https%3A%2F%2Fdeezer%2Ftrack%2F3') });
    const { findByText } = render(Page);
    expect(await findByText('Nightcall')).toBeInTheDocument();
    expect(convert.mock.calls[0][0]).toBe('https://deezer/track/3');
  });

  it('converts again when the url parameter changes on the same page', async () => {
    convert.mockResolvedValueOnce(response('Nightcall')).mockResolvedValueOnce(response('OutRun'));
    page.set({ url: new URL('http://localhost/?url=https%3A%2F%2Fdeezer%2Ftrack%2F3') });
    const { findByText } = render(Page);
    await findByText('Nightcall');
    page.set({ url: new URL('http://localhost/?url=https%3A%2F%2Fdeezer%2Falbum%2F7') });
    expect(await findByText('OutRun')).toBeInTheDocument();
    await waitFor(() => expect(convert.mock.calls[1][0]).toBe('https://deezer/album/7'));
  });

  it('takes the link out of text shared from another app', async () => {
    convert.mockResolvedValue(response('Nightcall'));
    const text = encodeURIComponent("Here's a song for you… Nightcall https://open.spotify.com/track/abc?si=1");
    page.set({ url: new URL(`http://localhost/?title=Nightcall&text=${text}`) });
    const { findByText } = render(Page);
    await findByText('Nightcall');
    expect(convert.mock.calls[0][0]).toBe('https://open.spotify.com/track/abc?si=1');
  });

  it('prefers a shared url over shared text', async () => {
    convert.mockResolvedValue(response('Nightcall'));
    page.set({ url: new URL('http://localhost/?url=https%3A%2F%2Fdeezer%2Ftrack%2F3&text=https%3A%2F%2Fother%2Fx') });
    const { findByText } = render(Page);
    await findByText('Nightcall');
    expect(convert.mock.calls[0][0]).toBe('https://deezer/track/3');
  });

  it('ignores shared text without a link', () => {
    page.set({ url: new URL('http://localhost/?text=just%20words') });
    render(Page);
    expect(convert).not.toHaveBeenCalled();
  });

  describe('text search', () => {
    const results = [
      { service: 'deezer', type: 'track', url: 'https://deezer/track/3', title: 'Nightcall', artists: ['Kavinsky'], album: 'OutRun', artwork: '' },
      { service: 'deezer', type: 'album', url: 'https://deezer/album/7', title: 'OutRun', artists: ['Kavinsky'], artwork: '' }
    ];

    async function enter(input: HTMLElement, text: string) {
      await fireEvent.input(input, { target: { value: text } });
      await fireEvent.keyDown(input, { key: 'Enter' });
    }

    it('searches when the input is not a link and lists what it finds', async () => {
      search.mockResolvedValue({ results });
      const view = render(Page);
      await enter(view.getByRole('textbox'), 'kavinsky nightcall');
      expect(await view.findByRole('button', { name: /Nightcall.*Kavinsky/ })).toBeInTheDocument();
      expect(view.getByRole('button', { name: /OutRun/ })).toBeInTheDocument();
      expect(search.mock.calls[0][0]).toBe('kavinsky nightcall');
      expect(convert).not.toHaveBeenCalled();
    });

    it('converts the result that is picked', async () => {
      search.mockResolvedValue({ results });
      convert.mockResolvedValue(response('OutRun'));
      const view = render(Page);
      await enter(view.getByRole('textbox'), 'kavinsky');
      await fireEvent.click(await view.findByRole('button', { name: /OutRun/ }));
      await waitFor(() => expect(convert.mock.calls[0][0]).toBe('https://deezer/album/7'));
      expect(await view.findByRole('heading', { name: 'OutRun' })).toBeInTheDocument();
      expect(view.queryByRole('button', { name: /Nightcall/ })).toBeNull();
    });

    it('says so when nothing was found', async () => {
      search.mockResolvedValue({ results: [] });
      const view = render(Page);
      await enter(view.getByRole('textbox'), 'zzzz');
      expect(await view.findByText('Nichts gefunden.')).toBeInTheDocument();
    });

    it('runs the search named in the q parameter', async () => {
      search.mockResolvedValue({ results });
      page.set({ url: new URL('http://localhost/?q=kavinsky%20nightcall') });
      const view = render(Page);
      expect(await view.findByRole('button', { name: /Nightcall.*Kavinsky/ })).toBeInTheDocument();
      expect(search.mock.calls[0][0]).toBe('kavinsky nightcall');
      expect(view.getByRole('textbox')).toHaveValue('kavinsky nightcall');
    });

    it('converts a link given in the q parameter', async () => {
      convert.mockResolvedValue(response('Nightcall'));
      page.set({ url: new URL('http://localhost/?q=https%3A%2F%2Fdeezer%2Ftrack%2F3') });
      const view = render(Page);
      await view.findByText('Nightcall');
      expect(convert.mock.calls[0][0]).toBe('https://deezer/track/3');
      expect(search).not.toHaveBeenCalled();
    });

    it('still converts a link straight away', async () => {
      convert.mockResolvedValue(response('Nightcall'));
      const view = render(Page);
      await enter(view.getByRole('textbox'), 'https://deezer/track/3');
      await view.findByText('Nightcall');
      expect(search).not.toHaveBeenCalled();
    });
  });

  describe('streamed conversion', () => {
    type Handlers = {
      onSource: (source: ConvertResponse['source'], pending: string[]) => void;
      onTarget: (service: string, result: ConvertResponse['targets'][string]) => void;
    };

    it('shows the item at once and fills in each service as it answers', async () => {
      let handlers!: Handlers;
      let finish!: (value: ConvertResponse) => void;
      convert.mockImplementation((_url: string, opts: Handlers) => {
        handlers = opts;
        return new Promise<ConvertResponse>((resolve) => (finish = resolve));
      });
      page.set({ url: new URL('http://localhost/?url=https%3A%2F%2Fdeezer%2Ftrack%2F3') });
      const { findByText, container, queryByText } = render(Page);
      await waitFor(() => expect(handlers).toBeDefined());

      const whole = response('Nightcall');
      handlers.onSource(whole.source, ['tidal', 'spotify']);
      expect(await findByText('Nightcall')).toBeInTheDocument();
      const row = (id: string) => container.querySelector(`[data-service-id="${id}"]`)!;
      expect(row('tidal')).toHaveAttribute('aria-busy', 'true');
      expect(row('spotify')).toHaveAttribute('aria-busy', 'true');

      handlers.onTarget('spotify', { status: 'ok', url: 'https://spotify/track/9' });
      await waitFor(() => expect(row('spotify')).not.toHaveAttribute('aria-busy'));
      expect(row('spotify').querySelector('a.link')).toHaveAttribute('href', 'https://spotify/track/9');
      expect(row('tidal')).toHaveAttribute('aria-busy', 'true');
      expect(queryByText('Teilen')).toBeNull();

      finish({
        ...whole,
        targets: { tidal: { status: 'not_found' }, spotify: { status: 'ok', url: 'https://spotify/track/9' } }
      });
      await waitFor(() => expect(row('tidal')).not.toHaveAttribute('aria-busy'));
      expect(await findByText('Teilen')).toBeInTheDocument();
    });
  });
});
