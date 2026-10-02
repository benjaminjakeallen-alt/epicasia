import { expect, test, type Page } from '@playwright/test';
import { signInWithFakeBackend, USER_ID } from './support/fakeBackend';

const SARAH = '00000000-0000-4000-8000-0000000000aa';
const ago = (min: number) => new Date(Date.now() - min * 60_000).toISOString();

const PROFILES = [
  { id: SARAH, display_name: 'Sarah Lee' },
  { id: USER_ID, display_name: 'Test Traveler' },
];

const MESSAGES = [
  // newest first, as the API returns them
  {
    id: 'm3',
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
    id: 'm2',
    user_id: SARAH,
    body: 'Heading to the hotel now',
    image_path: null,
    image_width: null,
    image_height: null,
    reply_to: null,
    deleted_at: null,
    created_at: ago(9),
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
];

const REACTIONS = [
  { message_id: 'm1', user_id: USER_ID, emoji: '❤️' },
  { message_id: 'm1', user_id: SARAH, emoji: '❤️' },
];

// Press and hold like a finger (RN-web long press needs the pointer held).
async function longPress(page: Page, target: ReturnType<Page['getByLabel']>) {
  const box = (await target.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(600);
  await page.mouse.up();
}

async function open(page: Page, path: string) {
  await page.goto(path);
  const skip = page.getByLabel('Skip intro');
  await skip.click();
  await expect(skip).toHaveCount(0);
}

test('empty chat invites the first message', async ({ page }) => {
  await signInWithFakeBackend(page, { profiles: PROFILES, messages: [] });
  await open(page, '/chat');

  await expect(page.getByText('Say hello to the group')).toBeVisible();
  await page.getByText('Dinner plans tonight? 🍜').click();
  await expect(page.getByTestId('chat-input')).toHaveValue('Dinner plans tonight? 🍜');
});

test('conversation shows names, replies and reactions; sending posts the message', async ({ page }) => {
  const backend = await signInWithFakeBackend(page, {
    profiles: PROFILES,
    messages: MESSAGES,
    message_reactions: REACTIONS,
  });
  await open(page, '/chat');

  await expect(page.getByText('Group chat')).toBeVisible();
  await expect(page.getByText('Today')).toBeVisible();
  // Sarah's two messages are one run: her name label shows once (the
  // second "Sarah" is the quote inside my reply).
  await expect(page.getByText('Sarah', { exact: true })).toHaveCount(2);
  await expect(page.getByText('Landed at Narita!').first()).toBeVisible();
  // My reply quotes her message.
  await expect(page.getByText('Welcome to Japan! 🎌')).toBeVisible();
  await expect(page.getByText('Landed at Narita!')).toHaveCount(2);
  // Two hearts, one of them mine.
  await expect(page.getByLabel('❤️ 2, including you. Tap to remove')).toBeVisible();

  await page.screenshot({ path: 'test-results/chat-conversation.png' });

  await page.getByTestId('chat-input').fill('Dinner at 7?');
  await page.getByTestId('chat-send').click();
  await expect.poll(() => backend.inserts.filter((i) => i.table === 'messages').length).toBe(1);
  const sent = backend.inserts.find((i) => i.table === 'messages')!.body;
  expect(sent).toMatchObject({
    user_id: USER_ID,
    body: 'Dinner at 7?',
    image_path: null,
    reply_to: null,
  });
  expect(String(sent.id)).toMatch(/^[0-9a-f-]{36}$/);
  await expect(page.getByText('Dinner at 7?')).toBeVisible();
  await expect(page.getByText('Not sent · tap to retry')).toHaveCount(0);
  await expect(page.getByTestId('chat-input')).toHaveValue('');
  // Once saved, the server is asked to push it to everyone else's phones.
  await expect.poll(() => backend.functions.length).toBe(1);
  expect(backend.functions[0]).toEqual({ name: 'notify-chat', body: { message_id: sent.id } });
  // Having the chat open marks it read.
  expect(backend.inserts.find((i) => i.table === 'chat_reads')!.body).toMatchObject({ user_id: USER_ID });
});

test('long press opens reactions and reply', async ({ page }) => {
  const backend = await signInWithFakeBackend(page, {
    profiles: PROFILES,
    messages: MESSAGES,
    message_reactions: [],
  });
  await open(page, '/chat');

  const bubble = page.getByLabel(/^Sarah Lee: Heading to the hotel now/);
  await longPress(page, bubble);
  await expect(page.getByLabel('React with 😂')).toBeVisible();
  await page.getByLabel('React with 😂').click();
  await expect.poll(() => backend.inserts.filter((i) => i.table === 'message_reactions').length).toBe(1);
  expect(backend.inserts.find((i) => i.table === 'message_reactions')!.body).toEqual({
    message_id: 'm2',
    user_id: USER_ID,
    emoji: '😂',
  });
  await expect(page.getByLabel('😂 1, including you. Tap to remove')).toBeVisible();

  await longPress(page, bubble);
  await page.getByText('Reply', { exact: true }).click();
  await expect(page.getByText('Replying to Sarah')).toBeVisible();
  await page.getByTestId('chat-input').fill('On my way too');
  await page.getByTestId('chat-send').click();
  await expect.poll(() => backend.inserts.filter((i) => i.table === 'messages').length).toBe(1);
  expect(backend.inserts.find((i) => i.table === 'messages')!.body).toMatchObject({ reply_to: 'm2', body: 'On my way too' });
});

test('home shows unread messages from others on the Group Chat hub', async ({ page }) => {
  await signInWithFakeBackend(page, {
    profiles: PROFILES,
    messages: MESSAGES,
    // Read up to between Sarah's two messages: only the later one (m2) is new;
    // my own reply (m3) never counts.
    chat_reads: [{ user_id: USER_ID, last_read_at: ago(9.5) }],
  });
  await open(page, '/');
  await expect(page.getByTestId('orbit-badge-chat')).toHaveText('1');
  await expect(page.getByLabel('Group Chat, 1 unread')).toHaveCount(1);
});

test('no badge when everything is read', async ({ page }) => {
  await signInWithFakeBackend(page, {
    profiles: PROFILES,
    messages: MESSAGES,
    chat_reads: [{ user_id: USER_ID, last_read_at: ago(0) }],
  });
  await open(page, '/');
  await expect(page.getByLabel('Group Chat', { exact: true })).toHaveCount(1);
  await expect(page.getByTestId('orbit-badge-chat')).toHaveCount(0);
});
