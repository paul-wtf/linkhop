import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readable } from 'svelte/store';
import { render } from '@testing-library/svelte';
import type { ConvertResponse } from '$lib/api/types';

vi.mock('$app/stores', () => ({
  page: readable({ params: { shortId: 'abc123' } })
}));

const lookup = vi.fn();
vi.mock('$lib/api/client', () => ({ lookup: (id: string) => lookup(id) }));

import Page from './+page.svelte';
import { autoOpen, preferredService } from '$lib/stores/preferences';

const result: ConvertResponse = {
  source: {
    service: 'deezer', type: 'track', id: '3', url: 'https://deezer/track/3',
    title: 'Nightcall', artists: ['Kavinsky'], artwork: ''
  },
  targets: { tidal: { status: 'ok', url: 'https://tidal/track/2' } },
  cache: { hit: true, ttl_seconds: 60 },
  opens: 42
};

describe('share page', () => {
  beforeEach(() => {
    preferredService.set(null);
    autoOpen.set(false);
    lookup.mockReset().mockResolvedValue(result);
  });

  it('shows how often the link was opened', async () => {
    const { findByText } = render(Page);
    expect(await findByText('42-mal geöffnet')).toBeInTheDocument();
    expect(lookup).toHaveBeenCalledWith('abc123');
  });

  it('does not forward anywhere by default', async () => {
    preferredService.set('tidal');
    const { findByText, queryByText } = render(Page);
    await findByText('Nightcall');
    expect(queryByText(/Weiter zu/)).toBeNull();
  });

  it('announces the forward when auto-open is on', async () => {
    preferredService.set('tidal');
    autoOpen.set(true);
    const { findByText } = render(Page);
    expect(await findByText(/Weiter zu tidal in 3/)).toBeInTheDocument();
  });
});
