import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const manifest = JSON.parse(readFileSync('static/manifest.webmanifest', 'utf8'));

describe('web manifest', () => {
  it('registers the app as a share target that lands on the home page', () => {
    expect(manifest.share_target).toEqual({
      action: '/',
      method: 'GET',
      params: { title: 'title', text: 'text', url: 'url' }
    });
    expect(manifest.start_url).toBe('/');
    expect(manifest.display).toBe('standalone');
  });

  it('ships every icon it names, one of them maskable', () => {
    for (const icon of manifest.icons) {
      expect(existsSync(`static${icon.src}`), icon.src).toBe(true);
    }
    expect(manifest.icons.some((i: { purpose?: string }) => i.purpose === 'maskable')).toBe(true);
    expect(manifest.icons.some((i: { sizes: string }) => i.sizes === '512x512')).toBe(true);
  });

  it('is linked from the page', () => {
    expect(readFileSync('src/app.html', 'utf8')).toContain('rel="manifest" href="/manifest.webmanifest"');
  });
});
