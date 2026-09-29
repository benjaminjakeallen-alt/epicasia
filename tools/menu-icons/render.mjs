import { chromium } from 'playwright-core';
import { writeFileSync } from 'node:fs';
const DIR = new URL('.', import.meta.url).pathname.replace(/\/$/, '');
const names = process.argv.slice(2).length ? process.argv.slice(2) : ['itinerary', 'flights', 'lodging', 'packing', 'journal', 'games'];
const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium',
  args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage({ viewport: { width: 600, height: 600 } });
page.on('pageerror', (e) => console.log('pageerror', e.message));
page.on('console', (m) => { if (m.type() === 'error') console.log('console', m.text()); });
await page.goto('http://localhost:8765/index.html');
await page.waitForFunction(() => window.ready === true, null, { timeout: 60000 });
for (const n of names) {
  const url = await page.evaluate((name) => window.renderIcon(name), n);
  writeFileSync(`${DIR}/out-${n}.png`, Buffer.from(url.split(',')[1], 'base64'));
  console.log('rendered', n);
}
await browser.close();
