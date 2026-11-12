// Renders the app icons for the web manifest from the favicon's design.
// Run: node scripts/generate-icons.mjs
// Playwright's bundled Chromium is used unless BROWSER_BIN names another one.
import { chromium } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const font = readFileSync(
  `${root}node_modules/@fontsource-variable/jetbrains-mono/files/jetbrains-mono-latin-wght-normal.woff2`
).toString('base64');

const ICONS = [
  { file: 'icon-192.png', size: 192, radius: 0.25, scale: 1 },
  { file: 'icon-512.png', size: 512, radius: 0.25, scale: 1 },
  // A maskable icon is cropped to a circle or squircle by the launcher: no
  // rounding of its own, and the mark inside the inner 80%.
  { file: 'icon-maskable-512.png', size: 512, radius: 0, scale: 0.72 }
];

const page = ({ size, radius, scale }) => `<!doctype html><style>
  @font-face { font-family: JBM; font-weight: 100 800;
    src: url(data:font/woff2;base64,${font}) format('woff2'); }
  html, body { margin: 0; background: transparent; }
  div { width: ${size}px; height: ${size}px; border-radius: ${size * radius}px;
    background: #89b4fa; color: #11111b; display: grid; place-items: center;
    font: 800 ${size * 0.41 * scale}px JBM; letter-spacing: -0.02em; }
</style><div>lh</div>`;

const browser = await chromium.launch(
  process.env.BROWSER_BIN ? { executablePath: process.env.BROWSER_BIN } : {}
);
for (const icon of ICONS) {
  const tab = await browser.newPage({ viewport: { width: icon.size, height: icon.size } });
  await tab.setContent(page(icon));
  await tab.evaluate(() => document.fonts.ready);
  await tab.screenshot({ path: `${root}static/${icon.file}`, omitBackground: true });
  await tab.close();
}
await browser.close();
