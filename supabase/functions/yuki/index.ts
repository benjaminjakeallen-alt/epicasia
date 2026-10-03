// yuki: the trip's AI voice assistant (Claude), and journal writing help.
//
// POST, the traveler's own JWT in Authorization:
//   { action: 'ask', messages: [{ role, text }…], today, tz, name, voice, device }
//       → { reply, remaining }   Answers from the app's data through tools;
//                                 voice: true = written to be spoken aloud.
//   { action: 'journal_draft', entry: { day, city, title, story, voice[], captions[] }, photos: [{ media_type, data }] }
//       → { draft, remaining }   A first-person entry from the day's notes.
//
// Every tool reads *as the caller* (RLS), so Yuki only ever sees what that
// traveler can see in the app. Bundled content (Arrivals guides, legs,
// emergency numbers, weather cities) comes from knowledge.ts, generated from
// the app's own files by tools/build-yuki-knowledge.mjs. Needs the
// ANTHROPIC_API_KEY function secret; a daily per-traveler cap
// (assistant_usage, service role) keeps the bill small.

import Anthropic from 'npm:@anthropic-ai/sdk@0';
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { KNOWLEDGE } from './knowledge.ts';

const MODEL = 'claude-opus-5-5';
const DAILY_LIMIT = 60;
const MAX_TURNS = 16;
const MAX_TOOL_ROUNDS = 6;
// If a safety classifier declines, the API re-runs the request on its
// recommended fallback model instead of refusing ("default" routing; the
// SDK's typings may predate it, hence the spread).
const FALLBACK = { fallbacks: 'default' } as Record<string, unknown>;

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
}

// ---------- prompts (stable text first, so it caches) ----------

const SYSTEM = `You are Yuki (雪, "snow"), the voice assistant inside Epic Asia, a private app for one family's group trip:
Tokyo → Kyoto & Nara → Beijing → Shanghai → Hong Kong, June 5–19, 2027, with three Disney parks on the way.

You help the traveler you're talking to with anything about the trip or the app — you can read everything in it that they can see: the itinerary, flights, the Arrivals guides (visas, airports, checklist), map pins, every chat room they're in, the shared photo gallery and albums, their own journal and the entries others shared, their saved documents (names, not contents), who's on the trip, the games and leaderboards, invite codes (organizers only), the phrasebook, live weather and money conversions — plus practical travel help (etiquette, food, getting around).

How to answer:
- Look things up with your tools instead of guessing. If the app doesn't have it (an empty itinerary day, no flight saved), say so plainly and suggest where to add it in the app.
- Short and friendly: a sentence or two, or a few lines starting with "•". Plain text only — no markdown headings, tables, bold or links syntax (you may paste a plain URL).
- Times in flights are local airport times. Say dates like "Mon, Jun 7".
- Entry rules in the Arrivals guide were last checked ${KNOWLEDGE.checked} for ${KNOWLEDGE.passport}; when visas or border rules come up, mention they should be re-checked 4–6 weeks before flying.
- Never invent confirmation codes, addresses, times or prices. Quote what the app holds.
- For phrases, use the app's phrasebook when it has the phrase; give the local script plus an easy pronunciation.
- Answer in the language the traveler speaks or writes in.
- You can't change anything in the app (read-only): point to the screen where they can.

Where things live in the app: Itinerary; Arrivals (country guides, airports, checklist, boarding passes, My documents); Group chat (rooms); Photos (albums); Journal; Toolkit (currency, phrasebook, weather, map pins); Games; Profile.`;

const VOICE = `They're talking to you out loud, and your answer will be read aloud by the phone. Answer in one to three short spoken sentences — no lists, bullets, symbols, emoji or URLs. Say times, dates and money the way a person would ("ten thirty in the morning", "about thirty-four dollars"). Spell out a code letter by letter only if they ask for it. If there's more, give the key part and offer the rest.`;

const JOURNAL_SYSTEM = `You write travel-journal entries for one person on a family group trip through Japan, China and Hong Kong (June 2027).
Write in their voice — first person, warm, natural, a little playful — from ONLY the notes, voice-note transcripts, captions and photos they give you. Don't invent people, places, food or events that aren't there; if there's very little to go on, keep it short.
120–220 words, 1–3 short paragraphs, plain text (no title, no headings, no hashtags, no emoji unless their notes use them).`;

// ---------- tools ----------

const TOOLS: Anthropic.Tool[] = [
  {
    name: 'get_itinerary',
    description:
      'The group itinerary: plan items per day (day, city, title, description, start time). Omit both days for the whole trip. Days are YYYY-MM-DD.',
    input_schema: {
      type: 'object',
      properties: { from_day: { type: 'string' }, to_day: { type: 'string' } },
      additionalProperties: false,
    },
  },
  {
    name: 'get_flights',
    description: 'Flights saved in the app (boarding passes): airline, number, airports, local departure/arrival times, confirmation code.',
    input_schema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'get_trip_guide',
    description:
      'Bundled trip guide: legs with dates; per country (japan, china, hongKong) entry/visa rules, arrival forms, tips and official links; airports on the route with arrival/departure steps and how to get to the city; the before-you-go checklist; emergency numbers.',
    input_schema: {
      type: 'object',
      properties: {
        country: { type: 'string', enum: ['japan', 'china', 'hongKong', 'all'] },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'get_map_pins',
    description: 'Places the group saved on the map (hotels, meeting points, food, sights, shops) with local-script addresses and notes. Optional city: tokyo, kyoto, beijing, shanghai, hongKong.',
    input_schema: {
      type: 'object',
      properties: { city: { type: 'string', enum: ['tokyo', 'kyoto', 'beijing', 'shanghai', 'hongKong'] } },
      additionalProperties: false,
    },
  },
  {
    name: 'search_chat',
    description:
      'Group chat messages this traveler can see, newest first, with sender and room. Optional text to search for, a room name, and a limit (max 40).',
    input_schema: {
      type: 'object',
      properties: { query: { type: 'string' }, room: { type: 'string' }, limit: { type: 'integer', minimum: 1, maximum: 40 } },
      additionalProperties: false,
    },
  },
  {
    name: 'get_my_journal',
    description: "The traveler's own journal entries (day, city, title, story, voice-note transcripts). Optional day YYYY-MM-DD.",
    input_schema: { type: 'object', properties: { day: { type: 'string' } }, additionalProperties: false },
  },
  {
    name: 'get_my_documents',
    description: "Which travel documents the traveler saved in My documents (kind and name only — not the files' contents).",
    input_schema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'get_travelers',
    description: 'Everyone on the trip (display names).',
    input_schema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'get_weather',
    description: "Live forecast for a trip city (now + 7 days, °C and °F) plus that city's typical June.",
    input_schema: {
      type: 'object',
      properties: { city: { type: 'string', enum: ['tokyo', 'kyoto', 'beijing', 'shanghai', 'hongKong'] } },
      required: ['city'],
      additionalProperties: false,
    },
  },
  {
    name: 'convert_currency',
    description: 'Convert money at today\'s rate, e.g. 5000 JPY to USD. ISO codes (JPY, CNY, HKD, USD, GBP, EUR, CAD, AUD, NZD…).',
    input_schema: {
      type: 'object',
      properties: { amount: { type: 'number' }, from: { type: 'string' }, to: { type: 'string' } },
      required: ['amount', 'from', 'to'],
      additionalProperties: false,
    },
  },
  {
    name: 'get_chat_rooms',
    description: 'The chat rooms this traveler can see (name, open or private, newest message).',
    input_schema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'get_photos',
    description:
      'The shared photo gallery: recent photos and videos (who, when taken, caption, city, from chat?, favorites), counts per person, and the albums. Optional person name, city (tokyo, kyoto, beijing, shanghai, hongKong) and limit (max 60).',
    input_schema: {
      type: 'object',
      properties: {
        person: { type: 'string' },
        city: { type: 'string', enum: ['tokyo', 'kyoto', 'beijing', 'shanghai', 'hongKong'] },
        limit: { type: 'integer', minimum: 1, maximum: 60 },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'get_shared_journals',
    description: "Journal entries other travelers shared with the group (who, day, city, title, story, voice-note transcripts).",
    input_schema: { type: 'object', properties: { day: { type: 'string' } }, additionalProperties: false },
  },
  {
    name: 'get_lost_in_translation',
    description: 'The Lost in Translation game: photos of funny English signs people posted (caption, city, who, upvotes, when).',
    input_schema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'get_phrasebook',
    description: "The app's phrasebook: English → Japanese, Mandarin and Cantonese (script + pronunciation), by category (Basics, Getting around, Food & drink, Shopping, Help).",
    input_schema: { type: 'object', properties: { category: { type: 'string' } }, additionalProperties: false },
  },
  {
    name: 'get_invites',
    description: 'Invite codes for joining the trip, with uses and expiry. Only organizers can see them (others get an empty list).',
    input_schema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'get_game_standings',
    description: 'Game leaderboards: Godzilla Rampage best scores and Lost in Translation points (upvotes received).',
    input_schema: { type: 'object', properties: {}, additionalProperties: false },
  },
];

type Ctx = { db: SupabaseClient; me: string; tz: string };

function dayLabel(day: string): string {
  const d = new Date(`${day}T12:00:00Z`);
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });
}

/** Flight times are airport wall-clock times stored as if UTC (see src/lib/dates.ts). */
function wallClock(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  const h = d.getUTCHours();
  return `${dayLabel(iso.slice(0, 10))} ${h % 12 === 0 ? 12 : h % 12}:${String(d.getUTCMinutes()).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
}

async function names(db: SupabaseClient): Promise<Map<string, string>> {
  const { data } = await db.from('profiles').select('id, display_name');
  return new Map((data ?? []).map((p) => [p.id, p.display_name]));
}

const WMO: Record<number, string> = {
  0: 'clear', 1: 'mostly clear', 2: 'partly cloudy', 3: 'cloudy', 45: 'fog', 48: 'fog', 51: 'drizzle', 53: 'drizzle',
  55: 'drizzle', 61: 'light rain', 63: 'rain', 65: 'heavy rain', 80: 'showers', 81: 'showers', 82: 'heavy showers',
  95: 'thunderstorms', 96: 'thunderstorms', 99: 'thunderstorms',
};

async function runTool(name: string, input: Record<string, unknown>, ctx: Ctx): Promise<unknown> {
  const { db, me, tz } = ctx;
  switch (name) {
    case 'get_itinerary': {
      let q = db.from('itinerary_items').select('day, city, title, description, start_time').order('day');
      if (typeof input.from_day === 'string') q = q.gte('day', input.from_day);
      if (typeof input.to_day === 'string') q = q.lte('day', input.to_day);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []).map((i) => ({
        date: dayLabel(i.day),
        day: i.day,
        city: i.city,
        title: i.title,
        description: i.description,
        time: i.start_time
          ? new Date(i.start_time).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: tz })
          : null,
      }));
    }
    case 'get_flights': {
      const { data, error } = await db
        .from('flights')
        .select('airline, flight_number, departure_airport, arrival_airport, departure_time, arrival_time, confirmation_code')
        .order('departure_time');
      if (error) throw error;
      return (data ?? []).map((f) => ({ ...f, departure_time: wallClock(f.departure_time), arrival_time: wallClock(f.arrival_time) }));
    }
    case 'get_trip_guide': {
      const c = typeof input.country === 'string' ? input.country : 'all';
      const countries = c === 'all' ? KNOWLEDGE.countries : KNOWLEDGE.countries.filter((x) => x.key === c);
      const codes = new Set(countries.flatMap((x) => x.airports as readonly string[]));
      return {
        checked: `${KNOWLEDGE.checked} for ${KNOWLEDGE.passport} — re-check 4–6 weeks before flying`,
        legs: KNOWLEDGE.legs,
        countries,
        airports: KNOWLEDGE.airports.filter((a) => codes.has(a.code)),
        checklist: KNOWLEDGE.checklist,
        emergency: KNOWLEDGE.emergency,
      };
    }
    case 'get_map_pins': {
      let q = db.from('map_pins').select('name, address, note, category, city, lat, lng').order('city');
      if (typeof input.city === 'string') q = q.eq('city', input.city);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    }
    case 'search_chat': {
      const limit = Math.min(40, Math.max(1, Number(input.limit) || 20));
      let q = db
        .from('messages')
        .select('user_id, room_id, body, image_path, video_path, created_at')
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .limit(limit);
      if (typeof input.query === 'string' && input.query.trim()) q = q.ilike('body', `%${input.query.trim().replace(/[%_]/g, '')}%`);
      const { data: rooms } = await db.from('chat_rooms').select('id, name');
      if (typeof input.room === 'string' && input.room.trim()) {
        const want = input.room.trim().toLowerCase();
        const ids = (rooms ?? []).filter((r) => r.name.toLowerCase().includes(want)).map((r) => r.id);
        q = q.in('room_id', ids.length ? ids : ['00000000-0000-0000-0000-000000000000']);
      }
      const [{ data, error }, people] = await Promise.all([q, names(db)]);
      if (error) throw error;
      const roomName = new Map((rooms ?? []).map((r) => [r.id, r.name]));
      return (data ?? []).map((m) => ({
        from: m.user_id === me ? 'you' : (people.get(m.user_id) ?? 'someone'),
        room: roomName.get(m.room_id) ?? 'a room',
        text: m.body ?? (m.video_path ? '[video]' : m.image_path ? '[photo]' : ''),
        when: new Date(m.created_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: tz }),
      }));
    }
    case 'get_my_journal': {
      let q = db.from('journal_entries').select('id, day, city, title, body').eq('user_id', me).order('day');
      if (typeof input.day === 'string') q = q.eq('day', input.day);
      const { data, error } = await q;
      if (error) throw error;
      const ids = (data ?? []).map((e) => e.id);
      const { data: media } = ids.length
        ? await db.from('journal_media').select('entry_id, kind, caption, transcript').in('entry_id', ids)
        : { data: [] };
      return (data ?? []).map((e) => ({
        date: dayLabel(e.day),
        city: e.city,
        title: e.title,
        story: e.body,
        voice_notes: (media ?? []).filter((m) => m.entry_id === e.id && m.kind === 'audio').map((m) => m.transcript ?? m.caption ?? '(no transcript)'),
        photo_captions: (media ?? []).filter((m) => m.entry_id === e.id && m.kind === 'photo' && m.caption).map((m) => m.caption),
      }));
    }
    case 'get_my_documents': {
      const { data, error } = await db.from('documents').select('kind, label, file_name').eq('user_id', me);
      if (error) throw error;
      return data ?? [];
    }
    case 'get_travelers':
      return [...(await names(db)).entries()].map(([id, n]) => (id === me ? `${n} (you)` : n));
    case 'get_weather': {
      const city = KNOWLEDGE.weatherCities.find((c) => c.key === input.city);
      if (!city) return { error: 'unknown city' };
      const url =
        `https://api.open-meteo.com/v1/forecast?latitude=${city.lat}&longitude=${city.lng}` +
        '&current=temperature_2m,weather_code&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=auto&forecast_days=7';
      const f = (c: number) => Math.round((c * 9) / 5 + 32);
      try {
        const res = await fetch(url);
        const w = await res.json();
        return {
          city: city.name,
          now: w.current ? `${Math.round(w.current.temperature_2m)}°C / ${f(w.current.temperature_2m)}°F, ${WMO[w.current.weather_code] ?? 'mixed'}` : null,
          days: (w.daily?.time ?? []).map((d: string, i: number) => ({
            date: dayLabel(d),
            sky: WMO[w.daily.weather_code[i]] ?? 'mixed',
            high: `${Math.round(w.daily.temperature_2m_max[i])}°C / ${f(w.daily.temperature_2m_max[i])}°F`,
            low: `${Math.round(w.daily.temperature_2m_min[i])}°C / ${f(w.daily.temperature_2m_min[i])}°F`,
            rain_chance: w.daily.precipitation_probability_max?.[i] ?? null,
          })),
          typical_june: city.typicalJune,
        };
      } catch {
        return { city: city.name, error: 'forecast unavailable', typical_june: city.typicalJune };
      }
    }
    case 'convert_currency': {
      const from = String(input.from).toUpperCase();
      const to = String(input.to).toUpperCase();
      const res = await fetch(`https://open.er-api.com/v6/latest/${encodeURIComponent(from)}`);
      const r = await res.json();
      const rate = r?.rates?.[to];
      if (!rate) return { error: `no rate for ${from} → ${to}` };
      return { amount: input.amount, from, to, result: Math.round(Number(input.amount) * rate * 100) / 100, rate, updated: r.time_last_update_utc };
    }
    case 'get_chat_rooms': {
      const { data, error } = await db.from('chat_rooms').select('id, name, is_private').order('created_at');
      if (error) throw error;
      return Promise.all(
        (data ?? []).map(async (r) => {
          const { data: last } = await db
            .from('messages')
            .select('body, created_at')
            .eq('room_id', r.id)
            .is('deleted_at', null)
            .order('created_at', { ascending: false })
            .limit(1);
          return { name: r.name, private: r.is_private, newest: last?.[0]?.body ?? null };
        }),
      );
    }
    case 'get_photos': {
      const limit = Math.min(60, Math.max(1, Number(input.limit) || 30));
      const [people, { data, error }, { data: favs }, { data: albums }, { data: links }] = await Promise.all([
        names(db),
        db.from('gallery_photos').select('id, user_id, caption, taken_at, bucket, video_path').order('taken_at', { ascending: false }).limit(500),
        db.from('photo_favorites').select('photo_id'),
        db.from('photo_albums').select('id, name'),
        db.from('album_photos').select('album_id'),
      ]);
      if (error) throw error;
      const favCount = new Map<string, number>();
      for (const f of favs ?? []) favCount.set(f.photo_id, (favCount.get(f.photo_id) ?? 0) + 1);
      const cityOf = (iso: string) => {
        const day = new Date(iso).toLocaleDateString('en-CA', { timeZone: tz });
        return [...KNOWLEDGE.legs].reverse().find((l) => day >= l.from && day <= '2027-06-19')?.key ?? null;
      };
      let rows = (data ?? []).map((p) => ({
        who: p.user_id === me ? 'you' : (people.get(p.user_id) ?? 'someone'),
        whoId: p.user_id,
        kind: p.video_path ? 'video' : 'photo',
        caption: p.caption,
        taken: new Date(p.taken_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: tz }),
        city: cityOf(p.taken_at),
        from_chat: p.bucket === 'chat',
        favorites: favCount.get(p.id) ?? 0,
      }));
      const total = rows.length;
      const perPerson: Record<string, number> = {};
      for (const r of rows) perPerson[r.who] = (perPerson[r.who] ?? 0) + 1;
      if (typeof input.person === 'string' && input.person.trim()) {
        const want = input.person.trim().toLowerCase();
        rows = rows.filter((r) => r.who.toLowerCase().includes(want) || (want === 'me' && r.whoId === me));
      }
      if (typeof input.city === 'string') rows = rows.filter((r) => r.city === input.city);
      const albumCount = new Map<string, number>();
      for (const l of links ?? []) albumCount.set(l.album_id, (albumCount.get(l.album_id) ?? 0) + 1);
      return {
        total_in_gallery: total,
        per_person: perPerson,
        albums: (albums ?? []).map((a) => ({ name: a.name, items: albumCount.get(a.id) ?? 0 })),
        photos: rows.slice(0, limit).map(({ whoId: _w, ...r }) => r),
      };
    }
    case 'get_shared_journals': {
      let q = db
        .from('journal_entries')
        .select('id, user_id, day, city, title, body')
        .eq('shared_to_group', true)
        .neq('user_id', me)
        .order('day');
      if (typeof input.day === 'string') q = q.eq('day', input.day);
      const [{ data, error }, people] = await Promise.all([q, names(db)]);
      if (error) throw error;
      const ids = (data ?? []).map((e) => e.id);
      const { data: media } = ids.length
        ? await db.from('journal_media').select('entry_id, kind, transcript').in('entry_id', ids)
        : { data: [] };
      return (data ?? []).map((e) => ({
        by: people.get(e.user_id) ?? 'someone',
        date: dayLabel(e.day),
        city: e.city,
        title: e.title,
        story: e.body?.slice(0, 2000) ?? null,
        voice_notes: (media ?? []).filter((m) => m.entry_id === e.id && m.kind === 'audio' && m.transcript).map((m) => m.transcript),
      }));
    }
    case 'get_lost_in_translation': {
      const [people, { data, error }, { data: votes }] = await Promise.all([
        names(db),
        db.from('game_entries').select('id, created_by, caption, city, created_at').eq('game', 'lost_in_translation').order('created_at', { ascending: false }),
        db.from('game_votes').select('entry_id'),
      ]);
      if (error) throw error;
      const count = new Map<string, number>();
      for (const v of votes ?? []) count.set(v.entry_id, (count.get(v.entry_id) ?? 0) + 1);
      return (data ?? []).map((e) => ({
        by: e.created_by === me ? 'you' : (people.get(e.created_by) ?? 'someone'),
        caption: e.caption,
        city: e.city,
        upvotes: count.get(e.id) ?? 0,
        posted: new Date(e.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: tz }),
      }));
    }
    case 'get_phrasebook': {
      const cat = typeof input.category === 'string' ? input.category.toLowerCase() : '';
      const book = KNOWLEDGE.phrasebook as Record<string, unknown>;
      return cat ? Object.fromEntries(Object.entries(book).filter(([k]) => k.toLowerCase().includes(cat))) : book;
    }
    case 'get_invites': {
      const { data } = await db.from('trip_invites').select('code, label, max_uses, uses, expires_at, revoked_at');
      return (data ?? []).map((i) => ({
        code: i.code,
        for: i.label,
        uses: `${i.uses}${i.max_uses ? ` of ${i.max_uses}` : ''}`,
        active: !i.revoked_at && (!i.expires_at || new Date(i.expires_at) > new Date()) && (!i.max_uses || i.uses < i.max_uses),
      }));
    }
    case 'get_game_standings': {
      const [people, { data: scores }, { data: entries }, { data: votes }] = await Promise.all([
        names(db),
        db.from('game_scores').select('user_id, score, level').eq('game', 'godzilla_rampage').order('score', { ascending: false }).limit(50),
        db.from('game_entries').select('id, created_by, game'),
        db.from('game_votes').select('entry_id'),
      ]);
      const best = new Map<string, number>();
      for (const s of scores ?? []) if (!best.has(s.user_id)) best.set(s.user_id, s.score);
      const owner = new Map((entries ?? []).map((e) => [e.id, e.created_by]));
      const points = new Map<string, number>();
      for (const v of votes ?? []) {
        const o = owner.get(v.entry_id);
        if (o) points.set(o, (points.get(o) ?? 0) + 1);
      }
      return {
        godzilla_rampage_best: [...best].map(([u, s]) => ({ player: people.get(u) ?? 'someone', score: s })),
        lost_in_translation_points: [...points].sort((a, b) => b[1] - a[1]).map(([u, p]) => ({ player: people.get(u) ?? 'someone', points: p })),
      };
    }
    default:
      return { error: `unknown tool ${name}` };
  }
}

// ---------- handler ----------

type Turn = { role: 'user' | 'assistant'; text: string };

function textOf(msg: Anthropic.Beta.BetaMessage): string {
  return msg.content
    .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('\n')
    .trim();
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);

  const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!apiKey) return json({ error: 'not_configured', message: 'Yuki isn’t switched on yet — an organizer needs to add the AI key.' }, 503);

  const url = Deno.env.get('SUPABASE_URL')!;
  const db = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
    auth: { persistSession: false },
  });
  const { data: who, error: whoErr } = await db.auth.getUser();
  if (whoErr || !who.user) return json({ error: 'Not signed in' }, 401);
  const me = who.user.id;

  let input: Record<string, unknown> = {};
  try {
    input = (await req.json()) ?? {};
  } catch {
    return json({ error: 'bad_request' }, 400);
  }

  const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
  const { data: used } = await admin.rpc('assistant_bump', { p_user: me });
  const count = typeof used === 'number' ? used : Number(used ?? 0);
  const remaining = Math.max(0, DAILY_LIMIT - count);
  if (count > DAILY_LIMIT)
    return json({ error: 'limit', message: `That's ${DAILY_LIMIT} questions today — Yuki needs a nap. Ask again tomorrow!` }, 429);

  const client = new Anthropic({ apiKey });
  const tz = typeof input.tz === 'string' && input.tz.length < 64 ? input.tz : 'UTC';

  try {
    if (input.action === 'journal_draft') {
      const e = (input.entry ?? {}) as Record<string, unknown>;
      const str = (v: unknown, n: number) => (typeof v === 'string' ? v.slice(0, n) : '');
      const list = (v: unknown) => (Array.isArray(v) ? v.filter((x) => typeof x === 'string').map((x) => x.slice(0, 3000)).slice(0, 10) : []);
      const photos = (Array.isArray(input.photos) ? input.photos : []).slice(0, 4).filter(
        (p): p is { media_type: string; data: string } =>
          !!p && typeof p.data === 'string' && p.data.length < 1_200_000 && ['image/jpeg', 'image/png', 'image/webp'].includes(p.media_type),
      );
      const notes = [
        `Day: ${str(e.day, 20)}${e.city ? ` in ${str(e.city, 80)}` : ''}`,
        e.title ? `Title: ${str(e.title, 200)}` : '',
        e.story ? `What they've written so far:\n${str(e.story, 6000)}` : '',
        ...list(e.voice).map((t, i) => `Voice note ${i + 1}: ${t}`),
        ...list(e.captions).map((t) => `Photo caption: ${t}`),
      ].filter(Boolean).join('\n\n');
      const content: Anthropic.Beta.BetaContentBlockParam[] = [
        ...photos.map((p) => ({ type: 'image' as const, source: { type: 'base64' as const, media_type: p.media_type as 'image/jpeg', data: p.data } })),
        { type: 'text', text: `${notes}\n\nWrite the journal entry.` },
      ];
      const msg = await client.beta.messages.create({
        model: MODEL,
        max_tokens: 4000,
        system: JOURNAL_SYSTEM,
        messages: [{ role: 'user', content }],
        output_config: { effort: 'low' },
        betas: ['server-side-fallback-2026-07-01'],
        ...FALLBACK,
      });
      if (msg.stop_reason === 'refusal') return json({ error: 'refused', message: 'Yuki couldn’t write that one — try different notes.' }, 422);
      return json({ draft: textOf(msg), remaining });
    }

    // action: 'ask'
    const turns = (Array.isArray(input.messages) ? input.messages : [])
      .filter((t): t is Turn => !!t && (t.role === 'user' || t.role === 'assistant') && typeof t.text === 'string' && !!t.text.trim())
      .slice(-MAX_TURNS)
      .map((t) => ({ role: t.role, content: t.text.slice(0, 4000) }));
    while (turns.length && turns[0].role !== 'user') turns.shift();
    if (!turns.length || turns[turns.length - 1].role !== 'user') return json({ error: 'bad_request' }, 400);

    const today = typeof input.today === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(input.today) ? input.today : new Date().toISOString().slice(0, 10);
    const name = typeof input.name === 'string' ? input.name.slice(0, 60) : '';
    const voice = input.voice === true;
    const device = typeof input.device === 'object' && input.device ? JSON.stringify(input.device).slice(0, 2000) : '';
    const ctx: Ctx = { db, me, tz };
    const messages: Anthropic.Beta.BetaMessageParam[] = turns;
    const system: Anthropic.Beta.BetaTextBlockParam[] = [
      { type: 'text', text: SYSTEM, cache_control: { type: 'ephemeral' } },
      {
        type: 'text',
        text:
          `Today is ${dayLabel(today)} (${today}), time zone ${tz}. You're talking with ${name || 'a traveler'}.` +
          (device ? `\nSettings and lists kept on their phone: ${device}` : '') +
          (voice ? `\n${VOICE}` : ''),
      },
    ];

    for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
      const msg = await client.beta.messages.create({
        model: MODEL,
        max_tokens: 4000,
        system,
        tools: TOOLS,
        messages,
        output_config: { effort: 'low' },
        betas: ['server-side-fallback-2026-07-01'],
        ...FALLBACK,
      });
      if (msg.stop_reason === 'refusal') return json({ reply: 'Sorry — that’s not something I can help with.', remaining });
      const calls = msg.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === 'tool_use');
      if (msg.stop_reason !== 'tool_use' || !calls.length || round === MAX_TOOL_ROUNDS) {
        return json({ reply: textOf(msg) || 'Hmm, I’m not sure — try asking another way?', remaining });
      }
      messages.push({ role: 'assistant', content: msg.content });
      const results = await Promise.all(
        calls.map(async (c) => {
          try {
            const out = await runTool(c.name, (c.input ?? {}) as Record<string, unknown>, ctx);
            return { type: 'tool_result' as const, tool_use_id: c.id, content: JSON.stringify(out).slice(0, 60_000) };
          } catch (err) {
            return { type: 'tool_result' as const, tool_use_id: c.id, is_error: true, content: String((err as Error)?.message ?? err) };
          }
        }),
      );
      messages.push({ role: 'user', content: results });
    }
    return json({ reply: 'Hmm, I’m not sure — try asking another way?', remaining });
  } catch (err) {
    if (err instanceof Anthropic.RateLimitError) return json({ error: 'busy', message: 'Yuki is busy — try again in a minute.' }, 503);
    if (err instanceof Anthropic.AuthenticationError) return json({ error: 'not_configured', message: 'Yuki’s AI key isn’t working — an organizer needs to check it.' }, 503);
    if (err instanceof Anthropic.APIError) return json({ error: 'upstream', message: 'Yuki couldn’t answer just now — try again.' }, 502);
    return json({ error: 'failed', message: 'Something went wrong — try again.' }, 500);
  }
});
