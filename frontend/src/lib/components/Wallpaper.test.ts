import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/svelte';
import Wallpaper from './Wallpaper.svelte';

describe('Wallpaper', () => {
  it('is decoration only', () => {
    const { container } = render(Wallpaper);
    const svg = container.querySelector('svg.wallpaper');
    expect(svg).toHaveAttribute('aria-hidden', 'true');
    expect(svg?.querySelectorAll('.moon circle')).toHaveLength(2);
    expect(svg?.querySelectorAll('.ridge')).toHaveLength(4);
  });
});
