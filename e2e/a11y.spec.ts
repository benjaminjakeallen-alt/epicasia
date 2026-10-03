import { AxeBuilder } from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { signInWithFakeBackend, USER_ID } from './support/fakeBackend';

// Accessibility audit of every signed-in screen on the fake backend:
// axe-core's WCAG 2.2 A/AA rules (contrast, names, roles, structure), plus
// a touch-target check — every control must be at least 44×44 pt (Apple's
// HIG; WCAG 2.2 AA's own minimum is only 24×24).
//
// The web build can't check VoiceOver, Dynamic Type or the fold — those
// still need a real device (CLAUDE.md → accessibility mode).

const SARAH = '00000000-0000-4000-8000-0000000000aa';
const EVERYONE = '00000000-0000-4000-8000-000000000001';
const ago = (min: number) => new Date(Date.now() - min * 60_000).toISOString();

const DOCS = [
  {
    id: 'd1',
    user_id: USER_ID,
    kind: 'passport',
    label: 'Passport',
    storage_path: `${USER_ID}/d1.jpg`,
    thumb_path: `${USER_ID}/d1.thumb.jpg`,
    mime: 'image/jpeg',
    size_bytes: 1_400_000,
    file_name: 'passport.jpg',
    created_at: ago(60),
  },
  {
    id: 'd2',
    user_id: USER_ID,
    kind: 'insurance',
    label: 'Travel insurance policy',
    storage_path: `${USER_ID}/d2.pdf`,
    thumb_path: null,
    mime: 'application/pdf',
    size_bytes: 240_000,
    file_name: 'policy.pdf',
    created_at: ago(30),
  },
];

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
    created_at: ago(60),
  },
];

const FINDS = [
  {
    id: 'g1',
    game: 'lost_in_translation',
    created_by: SARAH,
    storage_path: `${SARAH}/g1.jpg`,
    thumb_path: `${SARAH}/g1.thumb.jpg`,
    width: 1200,
    height: 900,
    caption: 'Slip carefully',
    city: 'tokyo',
    created_at: ago(30),
  },
  {
    id: 'g2',
    game: 'lost_in_translation',
    created_by: USER_ID,
    storage_path: `${USER_ID}/g2.jpg`,
    thumb_path: null,
    width: 900,
    height: 1200,
    caption: null,
    city: null,
    created_at: ago(10),
  },
];

const DATA = {
  documents: DOCS,
  game_entries: FINDS,
  game_votes: [{ entry_id: 'g1', user_id: USER_ID }],
  game_scores: [
    { id: 'r1', game: 'godzilla_rampage', user_id: USER_ID, score: 4200, level: 2, round: 1, hero: 'chris', created_at: ago(30) },
  ],
  map_pins: PINS,
  profiles: [
    { id: SARAH, display_name: 'Sarah Lee' },
    { id: USER_ID, display_name: 'Test Traveler' },
  ],
  itinerary_items: [
    {
      id: 'i1',
      day: '2027-06-06',
      city: 'Tokyo',
      title: 'Tokyo DisneySea',
      description: 'Rope drop at Mysterious Island.',
      start_time: '2027-06-06T09:00:00Z',
      end_time: null,
      created_by: USER_ID,
      created_at: ago(60),
    },
    {
      id: 'i2',
      day: '2027-06-10',
      city: 'Kyoto',
      title: 'Kinkaku-ji',
      description: null,
      start_time: null,
      end_time: null,
      created_by: null,
      created_at: ago(60),
    },
  ],
  flights: [
    {
      id: 'f1',
      airline: 'ANA',
      flight_number: 'NH 961',
      departure_airport: 'NRT',
      arrival_airport: 'PEK',
      departure_time: '2027-06-11T10:30:00Z',
      arrival_time: '2027-06-11T13:45:00Z',
      confirmation_code: 'ABC123',
      created_by: USER_ID,
      created_at: ago(60),
    },
  ],
  chat_rooms: [
    { id: EVERYONE, name: 'Everyone', emoji: '🌏', is_private: false, created_by: null, created_at: ago(5000) },
    { id: 'r2', name: 'Night owls', emoji: '🍻', is_private: true, created_by: USER_ID, created_at: ago(100) },
  ],
  chat_room_members: [{ room_id: 'r2', user_id: SARAH }],
  messages: [
    {
      room_id: EVERYONE,
      id: 'm2',
      user_id: USER_ID,
      body: 'Welcome to Japan! 🎌',
      image_path: null,
      image_width: null,
      image_height: null,
      reply_to: 'm1',
      deleted_at: null,
      created_at: ago(2),
    },
    {
      room_id: EVERYONE,
      id: 'm1',
      user_id: SARAH,
      body: 'Landed at Narita!',
      image_path: null,
      image_width: null,
      image_height: null,
      reply_to: null,
      deleted_at: null,
      created_at: ago(10),
    },
  ],
  message_reactions: [{ message_id: 'm1', user_id: USER_ID, emoji: '❤️' }],
  gallery_photos: [
    {
      id: 'p1',
      user_id: SARAH,
      bucket: 'gallery',
      storage_path: `${SARAH}/p1.jpg`,
      thumb_path: `${SARAH}/p1.thumb.jpg`,
      width: 4032,
      height: 3024,
      caption: 'Golden hour at Kinkaku-ji',
      message_id: null,
      created_at: ago(30),
    },
  ],
  photo_favorites: [],
  journal_entries: [
    {
      id: 'j1',
      user_id: USER_ID,
      title: 'Golden hour at Kinkaku-ji',
      body: 'The pavilion glowed over the pond.',
      day: '2027-06-10',
      city: 'Kyoto',
      shared_to_group: true,
      created_at: ago(30),
      updated_at: ago(30),
      journal_media: [
        { id: 'jm1', entry_id: 'j1', user_id: USER_ID, kind: 'photo', storage_path: `${USER_ID}/j1/jm1.jpg`, thumb_path: null, width: 4032, height: 3024, duration_ms: null, caption: null, position: 0, created_at: ago(30) },
        { id: 'jm2', entry_id: 'j1', user_id: USER_ID, kind: 'audio', storage_path: `${USER_ID}/j1/jm2.m4a`, thumb_path: null, width: null, height: null, duration_ms: 64000, caption: 'Temple bells', position: 1, created_at: ago(30) },
      ],
    },
    {
      id: 'j2',
      user_id: SARAH,
      title: 'Deer in Nara',
      body: 'They bow if you bow first.',
      day: '2027-06-10',
      city: 'Nara',
      shared_to_group: true,
      created_at: ago(20),
      updated_at: ago(20),
      journal_media: [],
    },
  ],
};

async function open(page: Page, path: string) {
  await page.goto(path);
  const skip = page.getByLabel('Skip intro');
  await skip.click();
  await expect(skip).toHaveCount(0);
  await expect(page.getByTestId('skeleton')).toHaveCount(0);
  await page.waitForTimeout(400); // let fades settle so contrast is measured on final colors
}

async function axe(page: Page) {
  const result = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  return result.violations.map((v) => ({
    rule: v.id,
    impact: v.impact,
    help: v.help,
    nodes: v.nodes.map((n) => `${n.target.join(' ')} — ${n.failureSummary?.split('\n').slice(1).join(' ')}`),
  }));
}

/** Visible controls smaller than 44×44. RN-web drops hitSlop, so real hit areas must be ≥ 44 (no hitSlop-only fixes). */
async function smallTargets(page: Page) {
  return page.evaluate(() => {
    const out: string[] = [];
    const els = document.querySelectorAll<HTMLElement>('[role="button"],[role="link"],[role="checkbox"],[role="switch"],button,a,input,textarea');
    for (const el of els) {
      const r = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      if (r.width === 0 || r.height === 0 || style.visibility === 'hidden') continue;
      if (el.closest('[aria-hidden="true"]')) continue;
      if (r.width < 44 - 0.5 || r.height < 44 - 0.5) {
        const name = el.getAttribute('aria-label') || el.textContent?.trim().slice(0, 30) || el.tagName;
        out.push(`${name} (${Math.round(r.width)}×${Math.round(r.height)})`);
      }
    }
    return out;
  });
}

const SCREENS: [string, string][] = [
  ['home', '/'],
  ['itinerary', '/itinerary'],
  ['add itinerary item', '/itinerary/new'],
  ['arrivals', '/arrivals'],
  ['arrivals: Japan guide', '/arrivals/japan'],
  ['arrivals: China guide', '/arrivals/china'],
  ['my documents', '/arrivals/documents'],
  ['add document', '/arrivals/add-document'],
  ['add flight', '/flights/new'],
  ['toolkit', '/toolkit'],
  ['currency converter', '/toolkit/currency'],
  ['phrasebook', '/toolkit/phrases'],
  ['weather (no forecast)', '/toolkit/weather'],
  ['map pins', '/toolkit/pins'],
  ['add a map pin', '/toolkit/new-pin'],
  ['games', '/games'],
  ['lost in translation', '/games/lost-in-translation'],
  ['new find', '/games/lost-in-translation/new'],
  ['godzilla rampage', '/games/rampage'],
  ['chat rooms', '/chat'],
  ['chat room', `/chat/${EVERYONE}`],
  ['new chat room', '/chat/new'],
  ['room info (private, mine)', '/chat/about/r2'],
  ['photos', '/photos'],
  ['journal', '/journal'],
  ['journal entry (mine, editing)', '/journal/j1'],
  ['journal entry (shared by someone else)', '/journal/j2'],
  ['new journal entry', '/journal/new'],
  ['photo book', '/journal/book'],
  ['profile', '/profile'],
  ['admin', '/admin'],
  ['trip leaderboard', '/games/leaderboard'],
  ['accessibility settings', '/accessibility'],
];

test('a11y: Yuki listening over home', async ({ page }) => {
  // A recognizer that just listens, so the overlay stays up for the audit.
  await page.addInitScript(() => {
    class Quiet {
      start() {}
      stop() {}
      abort() {}
    }
    const w = window as unknown as Record<string, unknown>;
    w.SpeechRecognition = Quiet;
    w.webkitSpeechRecognition = Quiet;
  });
  await signInWithFakeBackend(page, DATA);
  await open(page, '/');
  await page.getByTestId('home-yuki').click();
  await expect(page.getByTestId('yuki-overlay')).toBeVisible();
  const violations = await axe(page);
  const small = await smallTargets(page);
  expect(violations).toEqual([]);
  expect(small).toEqual([]);
});

for (const [name, path] of SCREENS) {
  test(`a11y: ${name}`, async ({ page }) => {
    await signInWithFakeBackend(page, DATA);
    await open(page, path);
    const violations = await axe(page);
    const small = await smallTargets(page);
    expect(violations).toEqual([]);
    expect(small).toEqual([]);
  });
}

test('a11y: photo viewer', async ({ page }) => {
  await signInWithFakeBackend(page, DATA);
  await open(page, '/photos');
  await page.getByTestId('gallery-cell').first().click();
  await page.waitForTimeout(500);
  expect(await axe(page)).toEqual([]);
  expect(await smallTargets(page)).toEqual([]);
});

test('a11y: document viewer', async ({ page }) => {
  await signInWithFakeBackend(page, DATA);
  await open(page, '/arrivals/documents');
  await page.getByRole('button', { name: /^Passport\./ }).click();
  await expect(page.getByTestId('document-viewer')).toBeVisible();
  await page.waitForTimeout(400);
  expect(await axe(page)).toEqual([]);
  expect(await smallTargets(page)).toEqual([]);
});

test('a11y: phrase shown large', async ({ page }) => {
  await signInWithFakeBackend(page, DATA);
  await open(page, '/toolkit/phrases');
  await page.getByRole('button', { name: /^Hello\. konnichiwa/ }).click();
  await expect(page.getByTestId('phrase-card')).toBeVisible();
  expect(await axe(page)).toEqual([]);
  expect(await smallTargets(page)).toEqual([]);
});

test('a11y: weather with a forecast', async ({ page }) => {
  await signInWithFakeBackend(page, DATA);
  const city = {
    current: { temperature_2m: 22, weather_code: 2 },
    daily: {
      time: ['2026-10-03', '2026-10-04'],
      weather_code: [2, 61],
      temperature_2m_max: [25, 20],
      temperature_2m_min: [18, 15],
      precipitation_probability_max: [10, 80],
    },
  };
  await page.route(/api\.open-meteo\.com/, (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify([city, city, city, city, city]) }),
  );
  await open(page, '/toolkit/weather');
  await expect(page.getByTestId('now-temp').first()).toBeVisible();
  expect(await axe(page)).toEqual([]);
  expect(await smallTargets(page)).toEqual([]);
});

test('a11y: pin address shown large', async ({ page }) => {
  await signInWithFakeBackend(page, DATA);
  await open(page, '/toolkit/pins');
  await page.getByRole('button', { name: /^Show the address of/ }).click();
  await expect(page.getByTestId('address-card')).toBeVisible();
  expect(await axe(page)).toEqual([]);
  expect(await smallTargets(page)).toEqual([]);
});

test('a11y: lost in translation leaderboard', async ({ page }) => {
  await signInWithFakeBackend(page, DATA);
  await open(page, '/games/lost-in-translation');
  await page.getByRole('tab', { name: 'Leaderboard' }).click();
  await expect(page.getByTestId('leaderboard')).toBeVisible();
  expect(await axe(page)).toEqual([]);
  expect(await smallTargets(page)).toEqual([]);
});

test('a11y: godzilla rampage game (the iframe and its controls)', async ({ page }) => {
  await signInWithFakeBackend(page, DATA);
  await open(page, '/games/rampage/play');
  await expect(page.frameLocator('[data-testid="game-frame"]').getByRole('button', { name: 'Jump' })).toBeVisible();
  expect(await axe(page)).toEqual([]); // axe also audits inside the game's frame
  const sizes = await page
    .frameLocator('[data-testid="game-frame"]')
    .locator('button:visible')
    .evaluateAll((els) => els.map((e) => [e.getAttribute('aria-label') ?? e.textContent, e.getBoundingClientRect()]));
  expect(sizes.filter(([, r]) => (r as DOMRect).width < 44 || (r as DOMRect).height < 44)).toEqual([]);
});

test('a11y: chat message sheet', async ({ page }) => {
  await signInWithFakeBackend(page, DATA);
  await open(page, `/chat/${EVERYONE}`);
  const bubble = page.getByLabel('Sarah Lee: Landed at Narita').getByText('Landed at Narita!');
  const box = (await bubble.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(600);
  await page.mouse.up();
  await expect(page.getByRole('dialog')).toBeVisible();
  expect(await axe(page)).toEqual([]);
  expect(await smallTargets(page)).toEqual([]);
});

test('a11y: home in large & spoken mode', async ({ page }) => {
  await signInWithFakeBackend(page, DATA);
  await page.addInitScript(() =>
    localStorage.setItem('epicasia.a11yMode', JSON.stringify({ enabled: true, speak: false, rate: 1, offered: true })),
  );
  await page.goto('/');
  await expect(page.getByTestId('home-title')).toBeVisible();
  await page.waitForTimeout(400);
  expect(await axe(page)).toEqual([]);
  expect(await smallTargets(page)).toEqual([]);
});

test('a11y: invites (admin)', async ({ page }) => {
  await signInWithFakeBackend(page, {
    ...DATA,
    profiles: [{ id: USER_ID, display_name: 'Test Traveler', avatar_url: null, is_admin: true }],
    trip_invites: [
      { code: 'K7QM-2XPA', label: 'The Allen family', created_at: ago(60), expires_at: null, max_uses: 5, uses: 1, revoked_at: null },
    ],
  });
  await open(page, '/invites');
  expect(await axe(page)).toEqual([]);
  expect(await smallTargets(page)).toEqual([]);
});

test('a11y: register with an invite link', async ({ page }) => {
  await page.routeWebSocket(/supabase\.co/, (ws) => ws.close());
  await page.route(/supabase\.co/, (route) => route.abort());
  await page.goto('/register?invite=K7QM-2XPA');
  const skip = page.getByLabel('Skip intro');
  await skip.click();
  await expect(skip).toHaveCount(0);
  await page.waitForTimeout(400);
  expect(await axe(page)).toEqual([]);
  expect(await smallTargets(page)).toEqual([]);
});
