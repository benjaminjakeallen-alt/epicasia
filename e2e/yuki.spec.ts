import { expect, test, type Page } from '@playwright/test';
import { signInWithFakeBackend, USER_ID } from './support/fakeBackend';

// Yuki, the voice assistant. The browser's speech recognition and speech
// synthesis are replaced by fakes the test drives: `__speech.say(text)`
// "speaks" into the microphone, `__speech.spoken` is what Yuki said aloud.
// The yuki Edge Function is answered by the fake backend (no AI in tests).

// A fake microphone for the journal's voice recorder.
test.use({ launchOptions: { args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] } });

const PROFILES = [{ id: USER_ID, display_name: 'Test Traveler', avatar_url: null, is_admin: false }];
const REPLY = 'Today is Tokyo DisneySea! Gates open at 9:00.';

async function fakeSpeech(page: Page) {
  await page.addInitScript(() => {
    type Result = { isFinal: boolean; 0: { transcript: string } };
    const speech = {
      live: [] as FakeRecognition[],
      started: 0,
      spoken: [] as string[],
      running: () => speech.live.length > 0,
      say(text: string, isFinal = true) {
        const r = speech.live[speech.live.length - 1];
        if (!r) return false;
        const last = r.results[r.results.length - 1];
        const index = last && !last.isFinal ? r.results.length - 1 : r.results.length;
        r.results[index] = { isFinal, 0: { transcript: text } };
        r.onresult?.({ resultIndex: index, results: r.results });
        return true;
      },
    };
    class FakeRecognition {
      lang = '';
      continuous = false;
      interimResults = false;
      results: Result[] = [];
      onresult: ((e: { resultIndex: number; results: Result[] }) => void) | null = null;
      onend: (() => void) | null = null;
      onerror: ((e: { error?: string }) => void) | null = null;
      start() {
        speech.started++;
        speech.live.push(this);
      }
      stop() {
        this.abort();
      }
      abort() {
        const i = speech.live.indexOf(this);
        if (i < 0) return;
        speech.live.splice(i, 1);
        setTimeout(() => this.onend?.(), 5);
      }
    }
    const w = window as unknown as Record<string, unknown>;
    w.SpeechRecognition = FakeRecognition;
    w.webkitSpeechRecognition = FakeRecognition;
    w.__speech = speech;
    const synth = {
      speaking: false,
      speak(u: SpeechSynthesisUtterance) {
        if (u.text.trim()) speech.spoken.push(u.text);
        setTimeout(() => {
          u.onstart?.(new Event('start') as SpeechSynthesisEvent);
          u.onboundary?.({ name: 'word' } as SpeechSynthesisEvent);
          setTimeout(() => u.onend?.(new Event('end') as SpeechSynthesisEvent), 200);
        }, 10);
      },
      cancel() {},
      getVoices: () => [],
      addEventListener() {},
      removeEventListener() {},
    };
    Object.defineProperty(window, 'speechSynthesis', { value: synth, configurable: true });
  });
}

const say = (page: Page, text: string, isFinal = true) =>
  page.evaluate(
    ([t, f]) =>
      (window as unknown as { __speech: { say(t: string, f: boolean): boolean } }).__speech.say(
        t as string,
        f as boolean,
      ),
    [text, isFinal] as const,
  );
const spoken = (page: Page) =>
  page.evaluate(() => (window as unknown as { __speech: { spoken: string[] } }).__speech.spoken.join(' | '));
const listening = (page: Page) =>
  page.evaluate(() => (window as unknown as { __speech: { running(): boolean } }).__speech.running());

async function open(page: Page, path: string) {
  await page.goto(path);
  const skip = page.getByLabel('Skip intro');
  await skip.click();
  await expect(skip).toHaveCount(0);
}

const asks = (backend: Awaited<ReturnType<typeof signInWithFakeBackend>>) =>
  backend.functions.filter((f) => f.name === 'yuki').map((f) => f.body as Record<string, unknown>);

test('tap Yuki, ask out loud: the blossom glows while she answers aloud, then a follow-up carries the conversation', async ({
  page,
}) => {
  await fakeSpeech(page);
  const backend = await signInWithFakeBackend(page, { profiles: PROFILES });
  await open(page, '/');
  await page.getByTestId('home-yuki').click();

  const overlay = page.getByTestId('yuki-overlay');
  await expect(overlay).toBeVisible();
  await expect(page.getByTestId('yuki-blossom')).toBeVisible();
  await expect(page.getByTestId('yuki-status')).toHaveText('I’m listening');

  await say(page, 'what is the plan', false);
  await expect(page.getByTestId('yuki-heard')).toHaveText('“what is the plan”');
  await say(page, 'what is the plan today');
  // A pause ends the question; she answers out loud and on screen.
  await expect(page.getByTestId('yuki-reply')).toHaveText(REPLY);
  await expect.poll(() => spoken(page)).toContain('Today is Tokyo DisneySea!');
  const first = asks(backend)[0];
  expect(first).toMatchObject({
    action: 'ask',
    name: 'Test',
    voice: true,
    messages: [{ role: 'user', text: 'what is the plan today' }],
    device: { screen: '/', home_currency: 'USD', temperature_unit: '°F', checklist_done: [] },
  });
  expect((first.device as { checklist_left: string[] }).checklist_left).toHaveLength(8);
  expect(String(first.today)).toMatch(/^\d{4}-\d{2}-\d{2}$/);

  // Then she listens again for a moment — no "Hey Yuki" needed.
  await expect(page.getByTestId('yuki-status')).toHaveText('Anything else?');
  await say(page, 'and tomorrow');
  await expect.poll(() => asks(backend).length).toBe(2);
  expect(asks(backend)[1].messages).toEqual([
    { role: 'user', text: 'what is the plan today' },
    { role: 'assistant', text: REPLY },
    { role: 'user', text: 'and tomorrow' },
  ]);

  // Nothing more said: she goes quiet and the blossom fades away.
  await expect(page.getByTestId('yuki-status')).toHaveText('Anything else?');
  await expect(overlay).toHaveCount(0, { timeout: 10_000 });
  expect(await listening(page)).toBe(false); // wake word is off: the mic is off
});

test('"Hey Yuki" wakes her from any screen once it is on; other talk is ignored', async ({ page }) => {
  await fakeSpeech(page);
  const backend = await signInWithFakeBackend(page, { profiles: PROFILES });
  await open(page, '/profile');
  expect(await listening(page)).toBe(false);

  const toggle = page.getByTestId('yuki-wake-toggle');
  await expect(toggle).toHaveAttribute('aria-checked', 'false');
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-checked', 'true');
  await expect.poll(() => listening(page)).toBe(true);
  expect(await page.evaluate(() => localStorage.getItem('epicasia.yukiWake'))).toBe('1');

  await say(page, 'I really like the sushi here');
  await page.waitForTimeout(1500);
  await expect(page.getByTestId('yuki-overlay')).toHaveCount(0);

  await say(page, 'Hey Yuki, what is the weather in Tokyo?');
  await expect(page.getByTestId('yuki-overlay')).toBeVisible();
  await expect(page.getByTestId('yuki-heard')).toHaveText('“what is the weather in Tokyo?”');
  await expect(page.getByTestId('yuki-reply')).toHaveText(REPLY);
  expect(asks(backend)[0]).toMatchObject({
    messages: [{ role: 'user', text: 'what is the weather in Tokyo?' }],
    device: { screen: '/profile' },
  });

  // ✕ stops her; she goes back to listening for "Hey Yuki".
  await page.getByTestId('yuki-stop').click();
  await expect(page.getByTestId('yuki-overlay')).toHaveCount(0);
  await expect.poll(() => listening(page)).toBe(true);

  // Still on after a reload; the home button shows she's listening.
  await page.reload();
  await page.getByLabel('Skip intro').click();
  await expect.poll(() => listening(page)).toBe(true);
  await page.goto('/');
  await page.getByLabel('Skip intro').click();
  await expect(page.getByTestId('yuki-listening-dot')).toBeVisible();
});

test.describe('with a microphone', () => {
  test.use({ permissions: ['microphone'] });

  test('a voice note takes the microphone; Yuki listens again when it closes', async ({ page }) => {
    await fakeSpeech(page);
    await page.addInitScript(() => localStorage.setItem('epicasia.yukiWake', '1'));
    await signInWithFakeBackend(page, { profiles: PROFILES, journal_entries: [] });
    await open(page, '/journal/new');
    await expect.poll(() => listening(page)).toBe(true);
    const before = await page.evaluate(() => (window as unknown as { __speech: { started: number } }).__speech.started);

    await page.getByTestId('journal-record').click();
    await expect.poll(() => listening(page)).toBe(false);
    await page.getByRole('button', { name: 'Start recording' }).click();
    await expect(page.getByRole('button', { name: 'Stop recording' })).toBeVisible();
    await expect.poll(() => listening(page)).toBe(true);
    // Only the transcriber listens now: "Hey Yuki" in a voice note is just words.
    await say(page, 'Hey Yuki look at this ramen');
    await expect(page.getByTestId('live-transcript')).toContainText('Hey Yuki look at this ramen');
    await expect(page.getByTestId('yuki-overlay')).toHaveCount(0);
    await page.waitForTimeout(800); // long enough to keep
    await page.getByRole('button', { name: 'Stop recording' }).click();
    await expect(page.getByTestId('voice-note')).toHaveCount(1);

    await expect.poll(() => listening(page)).toBe(true);
    expect(
      await page.evaluate(() => (window as unknown as { __speech: { started: number } }).__speech.started),
    ).toBeGreaterThan(before);
  });
});

test('before the AI key is added, Yuki says so aloud (and that is not sent back as conversation)', async ({ page }) => {
  await fakeSpeech(page);
  const backend = await signInWithFakeBackend(page, { profiles: PROFILES });
  let configured = false;
  await page.route(/functions\/v1\/yuki/, async (route) => {
    if (route.request().method() === 'OPTIONS') return route.fallback();
    if (configured) return route.fallback();
    backend.functions.push({ name: 'yuki', body: route.request().postDataJSON() });
    return route.fulfill({
      status: 503,
      contentType: 'application/json',
      headers: { 'access-control-allow-origin': '*' },
      body: JSON.stringify({
        error: 'not_configured',
        message: 'Yuki isn’t switched on yet — an organizer needs to add the AI key.',
      }),
    });
  });
  await open(page, '/');
  await page.getByTestId('home-yuki').click();
  await say(page, 'hello');
  await expect.poll(() => spoken(page)).toContain('isn’t switched on yet');

  configured = true;
  await expect(page.getByTestId('yuki-overlay')).toHaveCount(0);
  await page.getByTestId('home-yuki').click();
  await say(page, 'hello again');
  await expect.poll(() => asks(backend).length).toBe(2);
  expect(asks(backend)[1].messages).toEqual([{ role: 'user', text: 'hello again' }]);
});
