import { expect, test, type Page } from '@playwright/test';
import { signInWithFakeBackend } from './support/fakeBackend';

// Toolkit: currency converter (rates answered in-test, never the real
// service) and the phrasebook (speech recorded by a stubbed
// speechSynthesis with one Japanese and one Mandarin voice).

const RATES = {
  result: 'success',
  time_last_update_unix: Date.UTC(2026, 9, 2) / 1000,
  rates: { USD: 1, JPY: 150, CNY: 7.2, HKD: 7.8, GBP: 0.8, EUR: 0.9, CAD: 1.4, AUD: 1.5, NZD: 1.7 },
};

async function open(page: Page, path: string) {
  await page.goto(path);
  const skip = page.getByLabel('Skip intro');
  await skip.click();
  await expect(skip).toHaveCount(0);
}

async function rates(page: Page, mode: 'live' | 'offline') {
  await page.route(/open\.er-api\.com|api\.frankfurter\.dev/, (route) =>
    mode === 'live'
      ? route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(RATES) })
      : route.abort('internetdisconnected'),
  );
}

async function key(page: Page, k: string, times = 1) {
  for (let i = 0; i < times; i++) await page.getByTestId(`key-${k}`).click();
}

test('Toolkit is on the home ring and lists its tools', async ({ page }) => {
  await signInWithFakeBackend(page, {});
  await open(page, '/');
  await expect(page.getByRole('slider', { name: /^Itinerary, 1 of 7/ })).toBeVisible();
  await open(page, '/toolkit');
  await expect(page.getByTestId('tool-currency')).toBeVisible();
  await expect(page.getByTestId('tool-phrases')).toBeVisible();
});

test('currency: converts on the keypad, swaps, and remembers your currency', async ({ page }) => {
  await signInWithFakeBackend(page, {});
  await rates(page, 'live');
  await open(page, '/toolkit/currency');

  // Before the trip it starts on yen; 1,000 yen at 150/USD.
  await expect(page.getByTestId('amount-from')).toHaveText('¥1,000');
  await expect(page.getByTestId('amount-to')).toHaveText('$6.67');
  await expect(page.getByTestId('rates-status')).toHaveText('Rates from Oct 2');
  // Yen has no decimals: the keypad offers "00" instead of ".".
  await expect(page.getByTestId('key-.')).toHaveCount(0);

  await key(page, 'del', 4);
  await key(page, '5');
  await key(page, '00');
  await key(page, '0');
  await expect(page.getByTestId('amount-from')).toHaveText('¥5,000');
  await expect(page.getByTestId('amount-to')).toHaveText('$33.33');
  await expect(page.getByLabel('¥1,000 is $6.67')).toBeVisible(); // quick prices

  // Swap: now dollars → yen, starting from the converted amount.
  await page.getByTestId('swap').click();
  await expect(page.getByTestId('amount-from')).toHaveText('$33.33');
  await expect(page.getByTestId('amount-to')).toHaveText('¥5,000');

  // Hong Kong dollars, then pounds as your own currency (remembered).
  await page.getByRole('radio', { name: 'Hong Kong, Hong Kong dollar' }).click();
  await expect(page.getByTestId('amount-to')).toHaveText('HK$259.97');
  await page.getByRole('radio', { name: 'British pound' }).click();
  await expect(page.getByTestId('amount-from')).toHaveText('£33.33');
  await expect(page.getByTestId('amount-to')).toHaveText('HK$324.97');
  await page.screenshot({ path: 'test-results/toolkit-currency.png' });

  await page.reload();
  await page.getByLabel('Skip intro').click();
  await expect(page.getByRole('radio', { name: 'British pound' })).toBeChecked();
});

test('currency offline: saved rates, else the built-in approximate ones', async ({ page }) => {
  await signInWithFakeBackend(page, {});
  await rates(page, 'offline');
  await open(page, '/toolkit/currency');
  await expect(page.getByTestId('rates-status')).toContainText('Approximate rates from Oct 2');
  await expect(page.getByTestId('amount-to')).not.toHaveText('$0.00');

  // A saved copy from an earlier visit wins over the built-in rates.
  await page.evaluate(
    (r) => localStorage.setItem('epicasia.rates', JSON.stringify({ rates: r, date: '2026-10-01', source: 'live' })),
    RATES.rates,
  );
  await open(page, '/toolkit/currency');
  await expect(page.getByTestId('rates-status')).toHaveText('Offline · using rates saved Oct 1');
  await expect(page.getByTestId('amount-to')).toHaveText('$6.67');
});

test('phrasebook: three languages, show a phrase large and play it', async ({ page }) => {
  await page.addInitScript(() => {
    const w = window as unknown as { __said: { text: string; lang: string }[] };
    w.__said = [];
    const synth = window.speechSynthesis;
    synth.getVoices = () =>
      [
        { lang: 'ja-JP', name: 'Kyoko', voiceURI: 'ja', default: false, localService: true },
        { lang: 'zh-CN', name: 'Tingting', voiceURI: 'zh', default: false, localService: true },
      ] as unknown as SpeechSynthesisVoice[];
    synth.speak = (u: SpeechSynthesisUtterance) => {
      w.__said.push({ text: u.text, lang: u.lang });
    };
    synth.cancel = () => {};
  });
  const said = () => page.evaluate(() => (window as unknown as { __said: { text: string; lang: string }[] }).__said);
  await signInWithFakeBackend(page, {});
  await open(page, '/toolkit/phrases');

  await expect(page.getByRole('tab', { name: 'Japanese, Japan' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByText('トイレはどこですか？')).toBeVisible();
  await page.getByRole('button', { name: 'Say “Where is the toilet?” in Japanese' }).click();
  await expect.poll(said).toContainEqual({ text: 'トイレはどこですか？', lang: 'ja-JP' });

  // Mandarin: show it full screen, then play from there.
  await page.getByRole('tab', { name: 'Mandarin, Mainland China' }).click();
  await expect(page.getByTestId('emergency')).toHaveText('Police 110 · Ambulance 120 · Fire 119');
  await page.getByRole('button', { name: /^Where is the toilet\?\. xǐshǒujiān/ }).click();
  const card = page.getByTestId('phrase-card');
  await expect(card.getByText('洗手间在哪里？')).toBeVisible();
  await card.getByRole('button', { name: 'Play in Mandarin' }).click();
  await expect.poll(said).toContainEqual({ text: '洗手间在哪里？', lang: 'zh-CN' });
  await page.screenshot({ path: 'test-results/toolkit-phrase-card.png' });
  await card.getByRole('button', { name: 'Close' }).click();
  await expect(card).toHaveCount(0);

  // Cantonese has no voice here: nothing is spoken, and the app says why.
  await page.getByRole('tab', { name: 'Cantonese, Hong Kong' }).click();
  await expect(page.getByText('洗手間喺邊度？')).toBeVisible();
  await page.getByRole('button', { name: 'Say “Where is the toilet?” in Cantonese' }).click();
  await expect(page.getByTestId('no-voice')).toContainText('No Cantonese voice');
  expect((await said()).some((s) => s.lang === 'zh-HK')).toBe(false);
});
