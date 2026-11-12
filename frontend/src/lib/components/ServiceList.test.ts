import { beforeEach, describe, expect, it } from 'vitest';
import { render } from '@testing-library/svelte';
import ServiceList from './ServiceList.svelte';
import { preferredService } from '$lib/stores/preferences';

const targets = {
  spotify: { status: 'ok' as const, url: 'https://spotify/track/1' },
  tidal: { status: 'ok' as const, url: 'https://tidal/track/2' },
  apple_music: { status: 'not_found' as const }
};

function order(container: HTMLElement): string[] {
  return [...container.querySelectorAll<HTMLElement>('[data-service-id]')].map(
    (el) => el.dataset.serviceId!
  );
}

describe('ServiceList', () => {
  beforeEach(() => preferredService.set(null));

  it('keeps the API order without a preferred service', () => {
    const { container } = render(ServiceList, {
      props: { sourceService: 'deezer', sourceUrl: 'https://deezer/track/3', targets }
    });
    expect(order(container)).toEqual(['deezer', 'spotify', 'tidal', 'apple_music']);
  });

  it('moves the preferred service to the top of the targets and marks it', () => {
    preferredService.set('tidal');
    const { container, getByText } = render(ServiceList, {
      props: { sourceService: 'deezer', sourceUrl: 'https://deezer/track/3', targets }
    });
    expect(order(container)).toEqual(['deezer', 'tidal', 'spotify', 'apple_music']);
    expect(getByText('mein dienst').closest('[data-service-id]')).toHaveAttribute(
      'data-service-id',
      'tidal'
    );
  });
});
