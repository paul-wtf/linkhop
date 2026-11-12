import { describe, expect, it } from 'vitest';
import { accentFor, contrastRatio, dominantHue, hslToRgb } from './coverColor';

function pixels(...colors: [number, number, number, number][]): Uint8ClampedArray {
  return new Uint8ClampedArray(colors.flat());
}

function repeat<T>(item: T, n: number): T[] {
  return Array.from({ length: n }, () => item);
}

describe('dominantHue', () => {
  it('finds the hue of a single colour', () => {
    const hue = dominantHue(pixels(...repeat<[number, number, number, number]>([220, 30, 30, 255], 20)));
    expect(hue?.h).toBeCloseTo(0, 0);
    expect(hue?.s).toBeGreaterThan(0.6);
  });

  it('picks the colour that covers most of the image', () => {
    const hue = dominantHue(pixels(
      ...repeat<[number, number, number, number]>([20, 180, 170, 255], 30),
      ...repeat<[number, number, number, number]>([220, 30, 30, 255], 8)
    ));
    expect(hue?.h).toBeGreaterThan(160);
    expect(hue?.h).toBeLessThan(190);
  });

  it('returns nothing for a cover without colour', () => {
    expect(dominantHue(pixels(
      ...repeat<[number, number, number, number]>([10, 10, 10, 255], 20),
      ...repeat<[number, number, number, number]>([200, 200, 200, 255], 20),
      ...repeat<[number, number, number, number]>([250, 250, 250, 255], 20)
    ))).toBeNull();
  });

  it('ignores transparent pixels', () => {
    expect(dominantHue(pixels(...repeat<[number, number, number, number]>([220, 30, 30, 0], 20)))).toBeNull();
  });
});

describe('accentFor', () => {
  const crust = { r: 0x11, g: 0x11, b: 0x1b };
  const base = { r: 0xef, g: 0xf1, b: 0xf5 };
  const hues = [0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330];

  it.each(hues)('keeps dark text readable on hue %i in the dark theme', (h) => {
    const accent = accentFor({ h, s: 0.9 }, 'dark');
    expect(contrastRatio(hslToRgb(accent), crust)).toBeGreaterThanOrEqual(4.5);
  });

  it.each(hues)('keeps light text readable on hue %i in the light theme', (h) => {
    const accent = accentFor({ h, s: 0.9 }, 'light');
    expect(contrastRatio(hslToRgb(accent), base)).toBeGreaterThanOrEqual(4.5);
  });

  it('keeps the hue of the cover', () => {
    expect(accentFor({ h: 200, s: 0.5 }, 'dark').h).toBe(200);
  });
});
