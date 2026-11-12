import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, waitFor } from '@testing-library/svelte';
import type { ConvertResponse } from '$lib/api/types';

const { page } = vi.hoisted(() => ({ page: { set: (_: { url: URL }) => {} } }));
vi.mock('$app/stores', async () => {
  const { writable: w } = await import('svelte/store');
  const store = w({ url: new URL('http://localhost/') });
  page.set = store.set;
  return { page: store };
});

const convert = vi.fn();
vi.mock('$lib/api/client', () => ({
  convert: (url: string, opts: unknown) => convert(url, opts),
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
});
