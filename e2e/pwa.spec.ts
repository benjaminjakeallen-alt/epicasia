import { expect, test } from '@playwright/test';

// "Add to Home Screen": the page links a manifest and an Apple touch icon
// (public/index.html), and every icon they name is actually served.
test('home-screen icon and manifest are linked and served', async ({ page, request }) => {
  await page.goto('/');
  await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveAttribute('href', '/apple-touch-icon.png');
  await expect(page.locator('meta[name="apple-mobile-web-app-title"]')).toHaveAttribute('content', 'Epic Asia');
  const href = await page.locator('link[rel="manifest"]').getAttribute('href');
  const manifest = await (await request.get(href!)).json();
  expect(manifest).toMatchObject({ name: 'Epic Asia', display: 'standalone', start_url: '/' });
  const srcs = ['/apple-touch-icon.png', ...manifest.icons.map((i: { src: string }) => i.src)];
  expect(manifest.icons.some((i: { purpose: string }) => i.purpose === 'maskable')).toBe(true);
  for (const src of srcs) {
    const res = await request.get(src);
    expect(res.status(), src).toBe(200);
    expect(res.headers()['content-type'], src).toContain('image/png');
  }
});
