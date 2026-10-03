import { expect, test, type Page } from '@playwright/test';
import { signInWithFakeBackend, USER_ID } from './support/fakeBackend';

const SARAH = '00000000-0000-4000-8000-0000000000aa';
const EVERYONE = '00000000-0000-4000-8000-000000000001';
const FOODIES = '00000000-0000-4000-8000-0000000000f0';
const ago = (min: number) => new Date(Date.now() - min * 60_000).toISOString();

const PROFILES = [
  { id: SARAH, display_name: 'Sarah Lee' },
  { id: USER_ID, display_name: 'Test Traveler' },
];

const ROOMS = [
  { id: EVERYONE, name: 'Everyone', emoji: '🌏', is_private: false, created_by: null, created_at: ago(5000) },
  { id: FOODIES, name: 'Foodies', emoji: '🍜', is_private: false, created_by: SARAH, created_at: ago(3000) },
];

const base = {
  room_id: EVERYONE,
  image_path: null,
  image_thumb_path: null,
  image_width: null,
  image_height: null,
  video_path: null,
  video_duration_ms: null,
  reply_to: null,
  edited_at: null,
  deleted_at: null,
};

const MESSAGES = [
  // newest first, as the API returns them
  { ...base, id: 'm3', user_id: USER_ID, body: 'Welcome to Japan! 🎌', reply_to: 'm1', created_at: ago(2) },
  { ...base, id: 'm2', user_id: SARAH, body: 'Heading to the hotel now', created_at: ago(9) },
  { ...base, id: 'm1', user_id: SARAH, body: 'Landed at Narita!', created_at: ago(10) },
  { ...base, id: 'f1', room_id: FOODIES, user_id: SARAH, body: 'Ramen at 8?', created_at: ago(30) },
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

test('room list: rooms with their newest message and unread counts', async ({ page }) => {
  await signInWithFakeBackend(page, {
    profiles: PROFILES,
    chat_rooms: ROOMS,
    messages: MESSAGES,
    chat_room_reads: [{ user_id: USER_ID, room_id: EVERYONE, last_read_at: ago(9.5) }],
  });
  await open(page, '/chat');

  const everyone = page.getByTestId('room-everyone');
  await expect(everyone).toContainText('Everyone');
  await expect(everyone).toContainText('You: Welcome to Japan! 🎌');
  await expect(everyone).toContainText('1'); // m2 only: m1 was read, m3 is mine
  const foodies = page.getByTestId('room-Foodies');
  await expect(foodies).toContainText('Sarah: Ramen at 8?');
  await expect(page.getByLabel(/^Foodies, 1 unread/)).toHaveCount(1); // never opened

  await everyone.click();
  await expect(page.getByTestId('room-title')).toHaveText('🌏 Everyone');
  await expect(page.getByText('Landed at Narita!').first()).toBeVisible();
  await expect(page.getByTestId('chat-list').getByText('Ramen at 8?')).toHaveCount(0);
});

test('empty room invites the first message', async ({ page }) => {
  await signInWithFakeBackend(page, { profiles: PROFILES, chat_rooms: ROOMS, messages: [] });
  await open(page, `/chat/${EVERYONE}`);

  await expect(page.getByText('Say hello to the group')).toBeVisible();
  await page.getByText('Dinner plans tonight? 🍜').click();
  await expect(page.getByTestId('chat-input')).toHaveValue('Dinner plans tonight? 🍜');
});

test('conversation shows names, replies and reactions; sending posts to the room', async ({ page }) => {
  const backend = await signInWithFakeBackend(page, {
    profiles: PROFILES,
    chat_rooms: ROOMS,
    messages: MESSAGES,
    message_reactions: REACTIONS,
  });
  await open(page, `/chat/${EVERYONE}`);

  await expect(page.getByText('Today')).toBeVisible();
  // Sarah's two messages are one run: her name label shows once (the
  // second "Sarah" is the quote inside my reply).
  await expect(page.getByText('Sarah', { exact: true })).toHaveCount(2);
  await expect(page.getByText('Welcome to Japan! 🎌')).toBeVisible();
  await expect(page.getByText('Landed at Narita!')).toHaveCount(2);
  await expect(page.getByLabel('❤️ 2, including you. Tap to remove')).toBeVisible();

  await page.getByTestId('chat-input').fill('Dinner at 7?');
  await page.getByTestId('chat-send').click();
  await expect.poll(() => backend.inserts.filter((i) => i.table === 'messages').length).toBe(1);
  const sent = backend.inserts.find((i) => i.table === 'messages')!.body;
  expect(sent).toMatchObject({
    room_id: EVERYONE,
    user_id: USER_ID,
    body: 'Dinner at 7?',
    image_path: null,
    video_path: null,
    reply_to: null,
  });
  expect(String(sent.id)).toMatch(/^[0-9a-f-]{36}$/);
  await expect(page.getByText('Dinner at 7?')).toBeVisible();
  await expect(page.getByText('Not sent · tap to retry')).toHaveCount(0);
  await expect(page.getByTestId('chat-input')).toHaveValue('');
  // Once saved, the server is asked to push it to everyone else.
  await expect.poll(() => backend.functions.filter((f) => 'message_id' in (f.body as object)).length).toBe(1);
  expect(backend.functions.find((f) => 'message_id' in (f.body as object))).toEqual({
    name: 'notify-chat',
    body: { message_id: sent.id },
  });
  // Having the room open marks it read.
  expect(backend.inserts.find((i) => i.table === 'chat_room_reads')!.body).toMatchObject({
    user_id: USER_ID,
    room_id: EVERYONE,
  });
});

test('long press: react, reply, mute a person', async ({ page }) => {
  const backend = await signInWithFakeBackend(page, {
    profiles: PROFILES,
    chat_rooms: ROOMS,
    messages: MESSAGES,
    message_reactions: [],
  });
  await open(page, `/chat/${EVERYONE}`);

  const bubble = page.getByLabel(/^Sarah Lee: Heading to the hotel now/);
  await longPress(page, bubble);
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

  await longPress(page, bubble);
  await page.getByText('Mute Sarah', { exact: true }).click();
  await expect.poll(() => backend.inserts.filter((i) => i.table === 'chat_mutes').length).toBe(1);
  expect(backend.inserts.find((i) => i.table === 'chat_mutes')!.body).toEqual({ user_id: USER_ID, muted_user_id: SARAH });
  await expect(page.getByText('No more notifications from Sarah')).toBeVisible();
});

test('edit your own message', async ({ page }) => {
  const backend = await signInWithFakeBackend(page, { profiles: PROFILES, chat_rooms: ROOMS, messages: MESSAGES });
  await open(page, `/chat/${EVERYONE}`);

  // Only your own messages can be edited.
  await longPress(page, page.getByLabel(/^Sarah Lee: Heading to the hotel now/));
  await expect(page.getByText('Edit message')).toHaveCount(0);
  await page.getByLabel('Close', { exact: true }).click();

  await longPress(page, page.getByLabel(/^You: Welcome to Japan/));
  await page.getByText('Edit message').click();
  await expect(page.getByText('Editing message')).toBeVisible();
  await expect(page.getByTestId('chat-input')).toHaveValue('Welcome to Japan! 🎌');
  await page.getByTestId('chat-input').fill('Welcome to Tokyo! 🗼');
  await page.getByLabel('Save edit').click();

  await expect.poll(() => backend.updates.filter((u) => u.table === 'messages').length).toBe(1);
  const edit = backend.updates.find((u) => u.table === 'messages')!;
  expect(edit.body).toEqual({ body: 'Welcome to Tokyo! 🗼' });
  expect(edit.query).toContain('id=eq.m3');
  await expect(page.getByText('Welcome to Tokyo! 🗼')).toBeVisible();
  await expect(page.getByText(/· Edited/)).toBeVisible();
  expect(backend.inserts.filter((i) => i.table === 'messages')).toHaveLength(0);
});

test('send a video: uploads the clip and its poster, then the row', async ({ page }) => {
  const backend = await signInWithFakeBackend(page, { profiles: PROFILES, chat_rooms: ROOMS, messages: [] });
  await open(page, `/chat/${EVERYONE}`);

  const chooser = page.waitForEvent('filechooser');
  await page.getByLabel('Attach a photo or video').click();
  await (await chooser).setFiles('e2e/fixtures/clip.webm');
  await expect(page.getByText('Video ready — add a caption or send')).toBeVisible();
  await page.getByTestId('chat-send').click();

  await expect.poll(() => backend.inserts.filter((i) => i.table === 'messages').length, { timeout: 15_000 }).toBe(1);
  const row = backend.inserts.find((i) => i.table === 'messages')!.body;
  const id = String(row.id);
  expect(row).toMatchObject({
    room_id: EVERYONE,
    video_path: `${USER_ID}/${id}.webm`,
    image_path: `${USER_ID}/${id}.jpg`,
    image_thumb_path: `${USER_ID}/${id}.thumb.jpg`,
    image_width: 320,
    image_height: 240,
  });
  expect(backend.uploads.map((u) => `${u.bucket}:${u.path}`).sort()).toEqual(
    [`chat:${USER_ID}/${id}.jpg`, `chat:${USER_ID}/${id}.thumb.jpg`, `chat:${USER_ID}/${id}.webm`].sort(),
  );
  // The bubble shows the poster with a play button; tapping plays it.
  await page.getByLabel(/^Play video/).click();
  await expect(page.getByTestId('chat-video')).toBeVisible();
});

test('make a private room with someone', async ({ page }) => {
  const backend = await signInWithFakeBackend(page, { profiles: PROFILES, chat_rooms: ROOMS, messages: [] });
  await open(page, '/chat/new');

  await page.getByTestId('room-name').fill('  Night   owls ');
  await page.getByLabel('🍻').click();
  await page.getByTestId('room-private').click();
  await page.getByRole('checkbox', { name: 'Sarah Lee' }).click();
  await page.getByText('Make room').click();

  await expect.poll(() => backend.inserts.filter((i) => i.table === 'chat_room_members').length).toBe(1);
  const room = backend.inserts.find((i) => i.table === 'chat_rooms')!.body;
  expect(room).toMatchObject({ name: 'Night owls', emoji: '🍻', is_private: true, created_by: USER_ID });
  const members = backend.inserts.find((i) => i.table === 'chat_room_members')!.body as unknown as { user_id: string }[];
  expect(members.map((m) => m.user_id).sort()).toEqual([USER_ID, SARAH].sort());
  await expect(page).toHaveURL(new RegExp(`/chat/${room.id}$`));
});

test('room info: mute the room', async ({ page }) => {
  const backend = await signInWithFakeBackend(page, { profiles: PROFILES, chat_rooms: ROOMS, messages: MESSAGES });
  await open(page, `/chat/${FOODIES}`);
  await page.getByTestId('room-info').click();
  await expect(page.getByTestId('room-info-name')).toHaveText('Foodies');
  // Not yours: no rename or delete.
  await expect(page.getByTestId('delete-room')).toHaveCount(0);

  await page.getByTestId('mute-room').click();
  await expect(page.getByTestId('mute-room')).toHaveAttribute('aria-checked', 'true');
  await expect.poll(() => backend.inserts.filter((i) => i.table === 'chat_mutes').length).toBe(1);
  expect(backend.inserts.find((i) => i.table === 'chat_mutes')!.body).toEqual({ user_id: USER_ID, muted_room_id: FOODIES });
});

test('home shows unread messages from others on the Group Chat hub', async ({ page }) => {
  await signInWithFakeBackend(page, {
    profiles: PROFILES,
    chat_rooms: ROOMS,
    messages: MESSAGES,
    // Everyone read up to between Sarah's two messages (m2 is new); Foodies
    // is read up to now. My own reply never counts.
    chat_room_reads: [
      { user_id: USER_ID, room_id: EVERYONE, last_read_at: ago(9.5) },
      { user_id: USER_ID, room_id: FOODIES, last_read_at: ago(0) },
    ],
  });
  await open(page, '/');
  await expect(page.getByTestId('orbit-badge-chat')).toHaveText('1');
  await expect(page.getByLabel('Group Chat, 1 unread')).toHaveCount(1);
});

test('no badge when everything is read', async ({ page }) => {
  await signInWithFakeBackend(page, {
    profiles: PROFILES,
    chat_rooms: ROOMS,
    messages: MESSAGES,
    chat_room_reads: [
      { user_id: USER_ID, room_id: EVERYONE, last_read_at: ago(0) },
      { user_id: USER_ID, room_id: FOODIES, last_read_at: ago(0) },
    ],
  });
  await open(page, '/');
  await expect(page.getByLabel('Group Chat', { exact: true })).toHaveCount(1);
  await expect(page.getByTestId('orbit-badge-chat')).toHaveCount(0);
});

test('chat notifications: turning them on subscribes this browser', async ({ page }) => {
  // Headless Chromium has no push service: stand in for the browser's side.
  await page.addInitScript(() => {
    let permission: NotificationPermission = 'default';
    Object.defineProperty(Notification, 'permission', { get: () => permission });
    Notification.requestPermission = async () => (permission = 'granted');
    let sub: unknown = null;
    PushManager.prototype.getSubscription = async () => sub as PushSubscription | null;
    PushManager.prototype.subscribe = async () => {
      sub = {
        endpoint: 'https://push.example.com/send/abc',
        toJSON: () => ({ endpoint: 'https://push.example.com/send/abc', keys: { p256dh: 'P256', auth: 'AUTH' } }),
        unsubscribe: async () => {
          sub = null;
          return true;
        },
      };
      return sub as PushSubscription;
    };
  });
  const backend = await signInWithFakeBackend(page, { profiles: PROFILES, chat_rooms: ROOMS, messages: [] });
  await open(page, '/profile');

  const toggle = page.getByTestId('push-toggle');
  await expect(toggle).toHaveAttribute('aria-checked', 'false');
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-checked', 'true');
  expect(backend.functions.map((f) => f.body)).toEqual([
    { action: 'key' },
    { action: 'subscribe', endpoint: 'https://push.example.com/send/abc', p256dh: 'P256', auth: 'AUTH' },
  ]);

  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-checked', 'false');
  expect(backend.functions.at(-1)!.body).toEqual({ action: 'unsubscribe', endpoint: 'https://push.example.com/send/abc' });
});
