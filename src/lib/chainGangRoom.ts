import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from './supabase';

// Chain Gang Dynasty rooms. One phone makes a room and reads out its code;
// up to three more join with it. Everyone in the room is on one private
// Supabase Realtime channel, `chaingang:<CODE>` (0026_chain_gang.sql lets any
// signed-in traveller use those topics):
//   presence   who's here: name, traveller, host, when they joined
//   'start'    the host starts the game: the line-up, in chain order
//   'g'        game traffic, relayed for the game in its iframe (the host's
//              snapshots, everyone's stick and buttons)
// Bluetooth isn't open to a web app, so the phones talk through Supabase.
//
// Tests can't open the realtime websocket, so with window.__CHAINGANG_LOCAL__
// set the room runs over a BroadcastChannel instead: two pages in one browser
// play together exactly as two phones would.

export const CHAIN_HEROES = ['chris', 'jake', 'bennett', 'miles'] as const;
export type ChainHero = (typeof CHAIN_HEROES)[number];
export const CHAIN_HERO_NAMES: Record<ChainHero, string> = { chris: 'Chris', jake: 'Jake', bennett: 'Bennett', miles: 'Miles' };
export const MAX_PLAYERS = 4;

export type RoomMember = { id: string; name: string; hero: ChainHero | null; host: boolean; joinedAt: number };
export type LineUp = { id: string | null; name: string; hero: ChainHero; bot: boolean }[];
export type StartPayload = { players: LineUp };

// No 0/O/1/I, so a code read out loud or off a screen can't be misread.
const LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export function makeCode(): string {
  const bytes = new Uint8Array(4);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => LETTERS[b % LETTERS.length]).join('');
}
/** What someone typed, as a code (or null if it can't be one). */
export function normalizeCode(raw: string): string | null {
  const c = raw.toUpperCase().replace(/[^A-Z0-9]/g, '');
  return c.length === 4 && [...c].every((ch) => LETTERS.includes(ch)) ? c : null;
}

/** The room's members: the host first, then in the order they joined; the first four play. */
export function sortMembers(list: RoomMember[]): RoomMember[] {
  return [...list].sort((a, b) => Number(b.host) - Number(a.host) || a.joinedAt - b.joinedAt || a.id.localeCompare(b.id));
}

/** The line-up the host starts with: everyone here in join order, bots in the empty places if wanted. */
export function lineUp(members: RoomMember[], fillWithBots: boolean): LineUp {
  const humans = sortMembers(members)
    .slice(0, MAX_PLAYERS)
    .filter((m): m is RoomMember & { hero: ChainHero } => !!m.hero)
    .map((m) => ({ id: m.id, name: m.name, hero: m.hero, bot: false }));
  if (!fillWithBots) return humans;
  const free = CHAIN_HEROES.filter((h) => !humans.some((p) => p.hero === h));
  return [...humans, ...free.slice(0, MAX_PLAYERS - humans.length).map((h) => ({ id: null, name: CHAIN_HERO_NAMES[h], hero: h, bot: true }))];
}

type Events = {
  onMembers: (members: RoomMember[]) => void;
  onStart: (payload: StartPayload) => void;
  onGame: (msg: unknown) => void;
  onStatus?: (status: 'connecting' | 'live' | 'error') => void;
};
export type Room = {
  code: string;
  me: string;
  update: (state: Partial<Pick<RoomMember, 'hero' | 'name'>>) => void;
  start: (payload: StartPayload) => void;
  send: (msg: unknown) => void;
  leave: () => void;
};

declare global {
  interface Window {
    __CHAINGANG_LOCAL__?: boolean;
  }
}

/** Joins (or, as host, opens) a room. Everyone gets a fresh member id, so one account on two devices is two players. */
export function joinRoom(code: string, who: { name: string; host: boolean }, events: Events): Room {
  const me = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const state: RoomMember = { id: me, name: who.name.slice(0, 20), hero: null, host: who.host, joinedAt: Date.now() };
  const local = typeof window !== 'undefined' && !!window.__CHAINGANG_LOCAL__;
  return local ? localRoom(code, state, events) : realtimeRoom(code, state, events);
}

function realtimeRoom(code: string, state: RoomMember, events: Events): Room {
  let channel: RealtimeChannel | null = null;
  let left = false;
  events.onStatus?.('connecting');
  const list = () => {
    if (!channel) return [];
    const ps = channel.presenceState<RoomMember>();
    return Object.values(ps).map((metas) => metas[metas.length - 1]).filter((m): m is RoomMember & { presence_ref: string } => !!m && typeof m.id === 'string');
  };
  // Private channels need the user's JWT on the realtime socket first.
  supabase.realtime
    .setAuth()
    .catch(() => {})
    .then(() => {
      if (left) return;
      channel = supabase
        .channel(`chaingang:${code}`, { config: { private: true, broadcast: { self: false }, presence: { key: state.id } } })
        .on('presence', { event: 'sync' }, () => events.onMembers(list().map(({ id, name, hero, host, joinedAt }) => ({ id, name, hero, host, joinedAt }))))
        .on('broadcast', { event: 'start' }, ({ payload }) => events.onStart(payload as StartPayload))
        .on('broadcast', { event: 'g' }, ({ payload }) => events.onGame(payload))
        .subscribe((status) => {
          if (status === 'SUBSCRIBED') {
            events.onStatus?.('live');
            channel?.track(state).catch(() => {});
          } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') events.onStatus?.('error');
        });
    });
  return {
    code,
    me: state.id,
    update(next) {
      Object.assign(state, next);
      channel?.track(state).catch(() => {});
    },
    start(payload) {
      channel?.send({ type: 'broadcast', event: 'start', payload }).catch(() => {});
    },
    send(msg) {
      channel?.send({ type: 'broadcast', event: 'g', payload: msg }).catch(() => {});
    },
    leave() {
      left = true;
      if (channel) {
        channel.untrack().catch(() => {});
        supabase.removeChannel(channel);
      }
    },
  };
}

// The test stand-in: the same room over a BroadcastChannel. Presence is each
// page saying "here" twice a second; a page that goes quiet for 6 s has left
// (a page in the background only gets its timers about once a second).
function localRoom(code: string, state: RoomMember, events: Events): Room {
  const bc = new BroadcastChannel(`chaingang:${code}`);
  const seen = new Map<string, { m: RoomMember; at: number }>();
  let sig = '';
  const emit = () => {
    const now = Date.now();
    for (const [id, v] of seen) if (now - v.at > 6000) seen.delete(id);
    const list = [state, ...[...seen.values()].map((v) => v.m)];
    const next = JSON.stringify(sortMembers(list));
    if (next !== sig) {
      sig = next;
      events.onMembers(sortMembers(list));
    }
  };
  const hello = () => bc.postMessage({ k: 'here', m: state });
  bc.onmessage = (e) => {
    const d = e.data as { k: string; m?: RoomMember; id?: string; payload?: unknown };
    if (d.k === 'here' && d.m) seen.set(d.m.id, { m: d.m, at: Date.now() });
    else if (d.k === 'bye' && d.id) seen.delete(d.id);
    else if (d.k === 'start') events.onStart(d.payload as StartPayload);
    else if (d.k === 'g') events.onGame(d.payload);
    emit();
  };
  const timer = setInterval(() => {
    hello();
    emit();
  }, 500);
  setTimeout(() => {
    events.onStatus?.('live');
    hello();
    emit();
  }, 0);
  return {
    code,
    me: state.id,
    update(next) {
      Object.assign(state, next);
      hello();
      emit();
    },
    start(payload) {
      bc.postMessage({ k: 'start', payload });
    },
    send(msg) {
      bc.postMessage({ k: 'g', payload: msg });
    },
    leave() {
      clearInterval(timer);
      bc.postMessage({ k: 'bye', id: state.id });
      bc.close();
    },
  };
}
