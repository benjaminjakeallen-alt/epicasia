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
const ago = (min: number) => new Date(Date.now() - min * 60_000).toISOString();

const DATA = {
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
  messages: [
    {
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
  ['flights', '/flights'],
  ['add flight', '/flights/new'],
  ['chat', '/chat'],
  ['photos', '/photos'],
  ['journal', '/journal'],
  ['journal entry (mine, editing)', '/journal/j1'],
  ['journal entry (shared by someone else)', '/journal/j2'],
  ['new journal entry', '/journal/new'],
  ['photo book', '/journal/book'],
  ['profile', '/profile'],
];

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

test('a11y: chat message sheet', async ({ page }) => {
  await signInWithFakeBackend(page, DATA);
  await open(page, '/chat');
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
