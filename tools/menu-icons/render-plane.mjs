// Renders the launch intro's plane sprite sheet (see README → "Launch plane").
import { chromium } from 'playwright-core';
import { writeFileSync } from 'node:fs';
const DIR = new URL('.', import.meta.url).pathname.replace(/\/$/, '');
const size = Number(process.argv[2] ?? 200);
const only = process.argv[3] ? process.argv[3].split(',').map(Number) : null;
const cols = only ? only.length : 6;
const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium',
  args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage({ viewport: { width: 600, height: 600 } });
page.on('pageerror', (e) => console.log('pageerror', e.message));
page.on('console', (m) => { if (m.type() === 'error') console.log('console', m.text()); });
await page.goto('http://localhost:8765/index.html');
await page.waitForFunction(() => window.ready === true, null, { timeout: 60000 });
const url = await page.evaluate((o) => window.renderPlaneSheet(o), { size, only, cols });
writeFileSync(`${DIR}/${only ? 'out-plane-test' : 'out-plane-sheet'}.png`, Buffer.from(url.split(',')[1], 'base64'));
console.log('rendered plane sheet');
await browser.close();
