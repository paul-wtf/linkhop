export interface Rgb { r: number; g: number; b: number }
export interface Hsl { h: number; s: number; l: number }
export interface Hue { h: number; s: number }

const BUCKETS = 24;
const CRUST: Rgb = { r: 0x11, g: 0x11, b: 0x1b };
const LATTE_BASE: Rgb = { r: 0xef, g: 0xf1, b: 0xf5 };
// WCAG AA for normal text: the accent carries button labels.
const MIN_CONTRAST = 4.5;

function rgbToHsl({ r, g, b }: Rgb): Hsl {
  const rn = r / 255, gn = g / 255, bn = b / 255;
  const max = Math.max(rn, gn, bn), min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return { h: 0, s: 0, l };
  const s = d / (1 - Math.abs(2 * l - 1));
  let h: number;
  if (max === rn) h = ((gn - bn) / d) % 6;
  else if (max === gn) h = (bn - rn) / d + 2;
  else h = (rn - gn) / d + 4;
  return { h: (h * 60 + 360) % 360, s, l };
}

export function hslToRgb({ h, s, l }: Hsl): Rgb {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  const [r, g, b] =
    h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x]
    : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return {
    r: Math.round((r + m) * 255),
    g: Math.round((g + m) * 255),
    b: Math.round((b + m) * 255)
  };
}

function luminance({ r, g, b }: Rgb): number {
  const lin = (v: number) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

export function contrastRatio(a: Rgb, b: Rgb): number {
  const la = luminance(a), lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

export function dominantHue(pixels: Uint8ClampedArray): Hue | null {
  const weight = new Array<number>(BUCKETS).fill(0);
  const hueX = new Array<number>(BUCKETS).fill(0);
  const hueY = new Array<number>(BUCKETS).fill(0);
  const sat = new Array<number>(BUCKETS).fill(0);
  let opaque = 0;
  let coloured = 0;

  for (let i = 0; i < pixels.length; i += 4) {
    if (pixels[i + 3] < 128) continue;
    opaque += 1;
    const { h, s, l } = rgbToHsl({ r: pixels[i], g: pixels[i + 1], b: pixels[i + 2] });
    if (s < 0.25 || l < 0.12 || l > 0.9) continue;
    coloured += 1;
    const bucket = Math.floor(h / (360 / BUCKETS)) % BUCKETS;
    const rad = (h * Math.PI) / 180;
    weight[bucket] += s;
    hueX[bucket] += Math.cos(rad) * s;
    hueY[bucket] += Math.sin(rad) * s;
    sat[bucket] += s * s;
  }

  // A few coloured pixels on a grey cover are noise, not its colour.
  if (opaque === 0 || coloured / opaque < 0.05) return null;

  const best = weight.indexOf(Math.max(...weight));
  const h = ((Math.atan2(hueY[best], hueX[best]) * 180) / Math.PI + 360) % 360;
  return { h: Math.round(h) % 360, s: sat[best] / weight[best] };
}

export function accentFor(hue: Hue, theme: 'dark' | 'light'): Hsl {
  const dark = theme === 'dark';
  const against = dark ? CRUST : LATTE_BASE;
  const step = dark ? 0.02 : -0.02;
  const accent: Hsl = {
    h: hue.h,
    s: Math.min(Math.max(hue.s, 0.45), 0.8),
    l: dark ? 0.76 : 0.44
  };
  while (
    contrastRatio(hslToRgb(accent), against) < MIN_CONTRAST &&
    accent.l > 0.08 && accent.l < 0.94
  ) {
    accent.l += step;
  }
  return accent;
}

export function hslCss({ h, s, l }: Hsl): string {
  return `hsl(${h} ${Math.round(s * 100)}% ${Math.round(l * 100)}%)`;
}

// A second, CORS-enabled image: a host without CORS headers then only costs
// the tint, never the visible cover.
export function loadCoverHue(src: string): Promise<Hue | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onerror = () => resolve(null);
    img.onload = () => {
      try {
        const size = 24;
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        if (!ctx) return resolve(null);
        ctx.drawImage(img, 0, 0, size, size);
        resolve(dominantHue(ctx.getImageData(0, 0, size, size).data));
      } catch {
        resolve(null);
      }
    };
    img.src = src;
  });
}
