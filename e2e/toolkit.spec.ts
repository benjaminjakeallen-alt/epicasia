import { expect, test, type Page } from '@playwright/test';
import { signInWithFakeBackend, USER_ID } from './support/fakeBackend';

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

// ---- Weather -----------------------------------------------------------------

function city(tempC: number, code: number) {
  return {
    current: { temperature_2m: tempC, weather_code: code },
    daily: {
      time: ['2026-10-03', '2026-10-04', '2026-10-05'],
      weather_code: [code, 61, 0],
      temperature_2m_max: [tempC + 3, 20, 25],
      temperature_2m_min: [tempC - 4, 15, 16],
      precipitation_probability_max: [10, 80, 0],
    },
  };
}
const FORECAST = [city(21.7, 1), city(23, 2), city(15, 0), city(24, 3), city(29, 95)];

test('weather: every city now and next days, °F/°C, typical June', async ({ page }) => {
  await signInWithFakeBackend(page, {});
  await page.route(/api\.open-meteo\.com/, (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(FORECAST) }),
  );
  await open(page, '/toolkit/weather');
  const cities = page.getByTestId('weather-city');
  await expect(cities).toHaveCount(5);
  const tokyo = cities.first();
  await expect(tokyo.getByText('Tokyo', { exact: true })).toBeVisible();
  await expect(tokyo.getByTestId('now-temp')).toHaveText('71°'); // 21.7 °C
  await expect(tokyo.getByLabel('Sun: Rain, high 68°, low 59°, 80% chance of rain')).toBeVisible();
  await expect(tokyo.getByTestId('june')).toContainText('Typical in June: 79° / 66°');
  await expect(cities.last().getByLabel('Now 84°, Thunderstorms')).toBeVisible();

  await page.getByRole('radio', { name: 'Celsius' }).click();
  await expect(tokyo.getByTestId('now-temp')).toHaveText('22°');
  await expect(tokyo.getByTestId('june')).toContainText('26° / 19°');
  await page.screenshot({ path: 'test-results/toolkit-weather.png' });

  // Offline next time: the saved forecast, with a note; the unit is remembered.
  await page.unroute(/api\.open-meteo\.com/);
  await open(page, '/toolkit/weather');
  await expect(page.getByTestId('weather-offline')).toContainText('Offline · forecast saved today');
  await expect(page.getByTestId('weather-city').first().getByTestId('now-temp')).toHaveText('22°');
});

test('weather with nothing saved and no signal still shows typical June', async ({ page }) => {
  await signInWithFakeBackend(page, {});
  await open(page, '/toolkit/weather');
  await expect(page.getByTestId('weather-none')).toBeVisible();
  await expect(page.getByTestId('june')).toHaveCount(5);
});

// ---- Map pins ------------------------------------------------------------------

const OTHER = '00000000-0000-4000-8000-000000000002';
const PINS = [
  {
    id: 'pin1',
    created_by: USER_ID,
    name: 'Hotel Gracery Shinjuku',
    address: '東京都新宿区歌舞伎町1-19-1',
    note: 'Godzilla on the roof',
    category: 'hotel',
    city: 'tokyo',
    lat: null,
    lng: null,
    created_at: '2026-10-01T00:00:00Z',
  },
  {
    id: 'pin2',
    created_by: OTHER,
    name: 'The Bund meeting point',
    address: null,
    note: null,
    category: 'meet',
    city: 'shanghai',
    lat: 31.24,
    lng: 121.49,
    created_at: '2026-10-01T00:00:00Z',
  },
];

async function recordOpens(page: Page) {
  await page.evaluate(() => {
    (window as unknown as { opened: string[] }).opened = [];
    window.open = ((u: string) => {
      (window as unknown as { opened: string[] }).opened.push(String(u));
      return null;
    }) as typeof window.open;
  });
}
const opened = (page: Page) => page.evaluate(() => (window as unknown as { opened: string[] }).opened);

test('map pins: grouped by city, open in Maps, show the address, remove your own', async ({ page }) => {
  const backend = await signInWithFakeBackend(page, { map_pins: PINS });
  await open(page, '/toolkit/pins');
  await expect(page.getByTestId('pin')).toHaveCount(2);
  await expect(page.getByRole('heading', { name: 'Tokyo' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Shanghai' })).toBeVisible();

  await recordOpens(page);
  await page.getByRole('button', { name: 'Open Hotel Gracery Shinjuku in Google Maps' }).click();
  await page.getByRole('button', { name: 'Open The Bund meeting point in Apple Maps' }).click();
  expect(await opened(page)).toEqual([
    'https://www.google.com/maps/search/?api=1&query=Hotel%20Gracery%20Shinjuku%2C%20%E6%9D%B1%E4%BA%AC%E9%83%BD%E6%96%B0%E5%AE%BF%E5%8C%BA%E6%AD%8C%E8%88%9E%E4%BC%8E%E7%94%BA1-19-1',
    'https://maps.apple.com/?q=The%20Bund%20meeting%20point&ll=31.24,121.49',
  ]);

  await page.getByRole('button', { name: 'Show the address of Hotel Gracery Shinjuku large' }).click();
  await expect(page.getByTestId('address-card')).toContainText('東京都新宿区歌舞伎町1-19-1');
  await page.getByTestId('address-card').getByRole('button', { name: 'Close' }).click();

  // Only your own pin can be removed.
  await expect(page.getByRole('button', { name: 'Remove The Bund meeting point' })).toHaveCount(0);
  page.once('dialog', (d) => d.accept());
  await page.getByRole('button', { name: 'Remove Hotel Gracery Shinjuku' }).click();
  await expect(page.getByTestId('pin')).toHaveCount(1);
  expect(backend.deletes).toEqual([{ table: 'map_pins', query: '?id=eq.pin1' }]);
});

test('map pins: add one with the exact spot from your location', async ({ page, context }) => {
  await context.grantPermissions(['geolocation']);
  await context.setGeolocation({ latitude: 34.9671, longitude: 135.7727, accuracy: 12 });
  const backend = await signInWithFakeBackend(page, { map_pins: [] });
  await open(page, '/toolkit/pins');
  await expect(page.getByText('Save the places that matter')).toBeVisible();
  await page.getByTestId('pins-add-button').click();

  await page.getByLabel('Name').fill('Fushimi Inari gate');
  await page.getByRole('radio', { name: 'Kyoto & Nara' }).click();
  await page.getByRole('radio', { name: 'Meeting point' }).click();
  await page.getByTestId('use-here').click();
  await expect(page.getByText('Exact spot saved (within 12 m)')).toBeVisible();
  await page.getByLabel('Note (optional)').fill('Meet at 7am before the crowds');
  await page.getByText('Save', { exact: true }).click();

  await expect.poll(() => backend.inserts.length).toBe(1);
  expect(backend.inserts[0]).toEqual({
    table: 'map_pins',
    body: {
      created_by: USER_ID,
      name: 'Fushimi Inari gate',
      address: null,
      note: 'Meet at 7am before the crowds',
      category: 'meet',
      city: 'kyoto',
      lat: 34.9671,
      lng: 135.7727,
    },
  });
});
