@AGENTS.md

# Epic Asia

iOS group-trip app for an upcoming Asia trip. Same shape as the Robinson
reunion app (individual logins, password reset, admin functions) but for
trip logistics instead of a family reunion.

## Planned feature set

Shared (all trip members, editable by all or an organizer role):
- **Itinerary — built** (day-by-day, grouped by day/city, see below),
  **Arrivals — built** (Oct 2 2026; replaced the Flights menu item — visa
  rules, airport walk-throughs, the boarding passes and My documents, see
  below)
- **Group chat — built** (see below)
- **Shared photo gallery — built** ("Photos", see below; chat photos flow
  into it automatically)
- **Removed: Lodging** (user decision, Oct 1 2026 — "we won't need a
  lodging-specific section"; its screens/lib were deleted and its menu
  slot went to Photos). The `lodging` table from 0001 is unused; leave it.
- **Removed: Packing list** (user decision, Oct 1 2026 — "we can get rid
  of the packing list section"; it was only a "Coming soon" hub on the
  ring, now gone along with `assets/images/menu/packing.png`). The
  `packing_items` table from 0001 is unused; leave it. Don't re-propose it.

Personal (per-user, not shared):
- Documents wallet — **built as "My documents" inside Arrivals** (see
  below), Journal (optionally shared with the group)
- **Journal — built** (Oct 2 2026, see below).

Utilities (client-side/API only, no backend needed):
- **Toolkit — built (Oct 3 2026): currency converter, phrasebook, weather
  and shared map pins** (see below).

**Accessibility mode for low vision — phase 1 built (Oct 2 2026),
phase 2 planned.** Built: "Large & spoken mode" (`src/lib/a11yMode.tsx`
provider + AsyncStorage `epicasia.a11yMode`; settings screen
`src/app/(app)/accessibility.tsx`, linked from Profile, itself large —
72pt rows, 19pt labels): **large home menu** (`OrbitMenu large`: 124pt
hubs, 40pt selected label, 64pt arrows and Open button; side hubs are
pictures only — the ring turns by swipe/arrows, so a near-miss can't open
the wrong thing), **spoken items** as the ring turns (`src/lib/speech.ts`:
VoiceOver on → `announceForAccessibility`; off → `expo-speech` with the
chosen rate, Slower/Normal/Faster, cutting off the previous item), **no
intro** (sets `epicasia.introSkip`), and a one-time **offer card** on
home when VoiceOver or text size ≥ 130% is detected. For everyone, the
selected label is a VoiceOver **adjustable** control ("Itinerary, 1 of
6", swipe up/down turns, double-tap opens; web exposes it as a slider
with aria-value*). **RN-web's `isScreenReaderEnabled()` resolves `true`
on web** — it can't detect one — which had made tapping a side hub on web
open it instead of turning the ring; `watchScreenReader()` treats web as
off. Tests: `e2e/a11y-mode.spec.ts` (settings persist + intro skipped +
large menu, spoken text via a stubbed `speechSynthesis`, speech off,
adjustable control) and the axe audit of home in large mode.
**Phase 2 (not started):** the high-contrast (AAA) and dark themes and
app-wide large type — these need a theming refactor first, because most
screens bake colors and sizes into module-level `StyleSheet`s from the
static `colors`/`type` tokens; plus fold-aware layouts and on-device
VoiceOver/Dynamic Type verification. Original brief, for phase 2: Requested Sept 30 2026 for a
friend on the trip with Stargardt disease (central vision loss, peripheral
vision largely preserved, reduced contrast sensitivity, glare/light
sensitivity, slow dark adaptation). Requirements from the user: everything
displays large, and the menus speak what each item is as you scroll
through them. Build it with standard accessibility practice:
- **Foldable layout:** treat the unfolded inner screen as a tablet-class
  canvas — size everything from `useWindowDimensions()` (never cache the
  first size), keep state across fold/unfold size changes, and use the
  extra width for bigger content rather than more content (one column of
  large cards, not two columns of small ones).
- **Large everything:** honor iOS Dynamic Type up to the accessibility
  sizes (no `maxFontSizeMultiplier` caps, `allowFontScaling` on, layouts
  that wrap rather than truncate), plus an in-app "Large" setting that
  scales type ~1.5–2× and touch targets to ≥ 60pt (WCAG 2.2 minimum is
  24px, Apple's is 44pt — go well past both here). Bigger orbit-menu hubs,
  labels always visible, no information carried by small captions alone.
- **Contrast and glare:** a high-contrast theme meeting WCAG AAA (7:1 for
  text), with a dark option — people with Stargardt are often
  glare-sensitive, which conflicts with the fixed light theme, so this
  mode is the one sanctioned exception. Respect iOS Increase Contrast,
  Bold Text, Reduce Transparency (drop the sky gradient/halos) and Reduce
  Motion.
- **Speech:** VoiceOver first — every control gets
  `accessibilityLabel`/`Role`/`Hint`; the orbit menu becomes an
  `adjustable` element with increment/decrement `accessibilityActions`,
  so a VoiceOver swipe up/down turns the ring and the new item is read
  ("Flights, 2 of 6. Boarding passes"). For users *not* running
  VoiceOver, the mode adds its own spoken announcements (`expo-speech`)
  as the ring turns, with adjustable rate — but when VoiceOver is on, use
  `AccessibilityInfo.announceForAccessibility` instead so nothing is read
  twice. Keep the existing per-step haptic tick as a non-visual cue.
- **Content:** don't put key info only in color (the leg colors need text
  labels too); flight/lodging confirmation codes readable large and
  copyable; avoid centered-only content the user must fixate on — lean on
  left-aligned, predictable layouts that suit peripheral viewing.
- **Setting:** a per-user toggle (persisted), offered automatically when
  large Dynamic Type or VoiceOver is detected; intro auto-skips in this
  mode.
- **Verify on real hardware:** VoiceOver on device, Xcode Accessibility
  Inspector, every Dynamic Type size, and both folded/unfolded postures —
  none of this can be verified in the web/Playwright build.

**Games — started (Oct 3 2026).** The user plans 5–6 trip games, each with
points and a leaderboard; **Lost in Translation** and **Godzilla Rampage**
are built (see below). (Trivia from the reunion app is still not planned.)

**Dropped: expense splitting** (user decision, Oct 1 2026 — don't propose
it again). The `expenses` / `expense_shares` tables from 0001 still exist
but are unused; leave them unless the user asks to remove them.

### Itinerary (built)

`src/lib/itinerary.ts` (fetch/create/delete against `itinerary_items`),
`src/app/(app)/itinerary/index.tsx` (list, grouped by day, refetches via
`useFocusEffect` from `expo-router` — not `@react-navigation/native`, which
isn't a direct dependency here; Expo Router vendors its own react-navigation
core and re-exports `useFocusEffect` itself), `src/app/(app)/itinerary/new.tsx`
(add form). Delete is only shown for a row's own creator
(`item.created_by === session.user.id`) — matches the RLS policy, which
also allows an admin to delete any row, but there's no admin-specific UI
for that yet. Day/time are plain text fields (`"2027-06-06"`,
`"9:00 AM"`), validated and parsed client-side (see `parseTimeInput`/
`isValidDay` in `new.tsx`) rather than a native date/time picker — a
deliberate scope cut to avoid picker version-compat risk unverifiable in
this environment; a real picker is a reasonable fast-follow.

Verified live end-to-end (see the network-egress note under Testing):
logged in, added "Tokyo DisneySea" via the real form, confirmed it rendered
correctly grouped under its day header with time/city/description, deleted
it and the test account afterward.

**The real trip plan is seeded (Sept 2026).** The user's 14-day plan from
their "Asia Disney Adventure" artifact
(`https://claude.ai/artifact/Cpu7mN9wmq6c3LbjQh1NcT` — built with Claude;
Tokyo → Kyoto/Nara → Beijing → Shanghai → Hong Kong, June 6–19, 2027) is
in `itinerary_items` as **unowned plan rows** (`created_by` null), via
`supabase/seed/asia-disney-adventure.sql` (idempotent — skips existing
day+title pairs; source data in the `.json` beside it). Migration 0004 made
`created_by` nullable with `ON DELETE SET NULL` for this. RLS needed no
change: everyone reads them, only admins can edit/delete them, and the app
shows no trash icon on them. If the artifact changes, update the JSON +
SQL and re-run rather than retyping entries through the form (existing
rows with a changed title won't be touched — delete/update those
explicitly).

### Arrivals (built, Oct 2 2026) — replaced the Flights menu item

The user: "I don't think the flights section is needed, but we could
replace with info on visas, relevant airport maps and how to navigate to
customs" — named **Arrivals**, with "a place to load visa docs" as a
subtask. On the ring as "Arrivals" (`href /(app)/arrivals`), icon
`assets/images/menu/arrivals.png`: a brass immigration stamp beside an
open sage passport full of entry stamps (the airliner `flights.png` was
retired with it).
- **Content** is bundled (`src/lib/arrivals.ts`, works offline): per
  country (Japan / Mainland China / Hong Kong) the entry line, visa notes,
  arrival forms (Visit Japan Web, China arrival card, HK landing slip),
  tips (IC/Octopus cards, Alipay/WeChat Pay, blocked apps) and official
  links; per airport on the route (NRT, KIX, PEK, PVG, HKG) numbered
  arriving (gate → immigration → bags → customs → exit) and/or leaving
  steps, getting to/from the city, and the official airport-map link; a
  before-you-go `CHECKLIST`. **Written for US passports, last checked
  October 2026 (`CHECKED`)** — an assumption; China's 240-hour visa-free
  transit (Japan → China → Hong Kong qualifies) must be re-checked before
  the trip. Update `CHECKED` with the text. `countryColor()` maps a country
  to its first leg's fill/text shades.
- **Screens** `src/app/(app)/arrivals/`: `index` (country cards, My
  documents card, checklist — ticks saved per phone in AsyncStorage
  `epicasia.arrivalsChecklist`, drawn checkboxes with `aria-checked`
  because RN-web drops `accessibilityState.checked` —, "Your flights"
  boarding passes, + adds a flight via the kept `/flights/new`),
  `[country]` (guide + airport cards + your flights touching that
  country's airports), `documents`, `add-document`. The old
  `flights/index.tsx` was deleted; `BoardingPass` now lives in
  `src/components/BoardingPass.tsx`.

### My documents (built, Oct 2 2026)

Private per-user wallet (passport, visa, insurance, Visit Japan Web QR,
China arrival card, bookings, other). Data `src/lib/documents.ts`; schema
`0011_travel_documents.sql` on the 0001 `documents` table (owner-only RLS
already) — adds `kind` (checked list), `mime`, `size_bytes`, `thumb_path`,
`file_name`, a label length cap and a check that `storage_path` is in the
owner's folder; the private `documents` bucket now takes only JPEG/PNG/
WebP/HEIC/PDF up to 20 MB. Files at `<uid>/<id>.<ext>`; photos also get a
device-made `.thumb.jpg` (shared `uploadPhoto`). Add = pick a kind (chips,
name follows the kind until edited), then Photo / Camera (native) / "PDF
or file" (`expo-document-picker`); a failed row insert removes the upload.
**Offline:** the list is `cached('documents')`, and on a phone
`keepOffline()` downloads every file to `Paths.document/travel-documents/
<uid>/` (and drops deleted ones) — "All saved on this phone · they open
offline". Photos open in a full-screen viewer (pinch-zoom on iOS, Share,
Delete); PDFs open the iOS share sheet (Quick Look preview, Save to Files,
Print) from the local copy; web opens a signed URL in a tab. **Sign-out
deletes the local folder** (`clearLocalDocuments`, next to
`clearOfflineCopies` in Profile). Tests: `e2e/arrivals.spec.ts` (countries,
checklist persists, China guide with PEK/PVG + the NRT→PEK pass, add a PDF
→ exact upload path + row, photo viewer + delete → row + both files
removed; the fake backend now records storage `removals`) and axe audits
of all four screens + the viewer.

### Toolkit (built, Oct 3 2026) — currency, phrasebook, weather, map pins

On the ring as **"Toolkit"** (user's name, 6th of 7, before Games), icon
`assets/images/menu/satchel.png` — an open sage leather messenger bag with
a phrasebook, banknotes, coins and a red map pin spilling out (the user's
idea; "Satchel 2" of three; prompt in `tools/menu-icons/README.md`). The
ring went 6 → 7 items, so VoiceOver/spoken labels read "… of 7".
Screens `src/app/(app)/toolkit/`: `index` (tool cards), `currency`,
`phrases`, `weather`, `pins`, `new-pin`. All work offline (weather and
pins from the last saved copy).
- **Currency** (`src/lib/currency.ts`): JPY / CNY / HKD against your own
  currency (USD default; GBP, EUR, CAD, AUD, NZD; saved as
  `epicasia.homeCurrency`). Rates: **open.er-api.com** (free, no key,
  daily, CORS-enabled — attribution "Rates By Exchange Rate API" is
  shown), backup **api.frankfurter.dev** (no CORS header, so native-only
  in practice). Each fetch is saved (`epicasia.rates`, not per-user); no
  network → saved copy ("Offline · using rates saved Oct 1"), else
  **bundled approximate rates** from Oct 2 2026 (labelled approximate).
  Starts on the currency of today's leg (`stopForDay`), JPY before the
  trip. Built-in keypad (no keyboard; "00" replaces "." for yen; hold ⌫
  to clear), swap button carries the converted amount over, "Quick
  prices" table of everyday amounts. `formatMoney()` formats by hand (no
  locale APIs) so it's identical on every platform.
- **Phrasebook** (`src/lib/phrases.ts`): ~34 phrases × Japanese (romaji),
  Mandarin (simplified + pinyin), Cantonese (traditional + Jyutping) in
  Basics / Getting around / Food & drink / Shopping / Help, plus each
  country's emergency numbers. Tap a phrase → full-screen card (64pt
  script, to hand the phone over) with "Play in …"; the speaker icon plays
  inline. Speech is `expo-speech` with the phone's own voice
  (`ja-JP`/`zh-CN`/`zh-HK`, rate 0.85); if the voice list has none for
  that language it says how to add one (iOS Settings → Accessibility →
  Spoken Content → Voices). **The web voice list can wait forever** when
  a browser has no voices (expo-speech awaits `onvoiceschanged`) — capped
  at 800ms. **Not yet checked by a native speaker** — worth doing.
- **Weather** (`src/lib/weather.ts`): **Open-Meteo** (free, no key, CORS),
  one request for all five cities (comma-separated lat/lng → array):
  current temp + WMO code, 7 days of code/high/low/rain %. Saved as
  `epicasia.weather`; offline shows it with "Offline · forecast saved …";
  nothing saved → a note, and typical June still shows. **Typical June**
  per city is bundled (approximate climate normals + a one-line note:
  tsuyu, plum rains, typhoon season). °F default (US group), °C toggle
  saved as `epicasia.tempUnit`. During the trip today's city is first
  ("You're here today"). The 7-day strip is a fixed row, not a horizontal
  ScrollView — axe flags scroll regions with nothing focusable; the
  credit is a real link for the same reason.
- **Map pins** (`src/lib/pins.ts`, migration `0012_map_pins.sql`): shared
  table — name, `address` (meant to be the local-script address, shown
  full screen "to show a driver"), note, category (hotel / meet / food /
  sight / shop / other), city (leg key or null = Anywhere), optional
  lat/lng (both or neither). RLS: members read + insert own; creator or
  admin update/delete. List grouped by city in route order; each pin
  opens **Apple Maps / Google Maps** (by coordinates when saved, else
  name + address search — Google Maps doesn't work in mainland China,
  Apple Maps does). "Use where I am" = **`expo-location`** (added, ~57.0.20,
  plugin with a when-in-use permission string only, background location
  off); web uses browser geolocation. Cached as `pins` for offline.
- Tests: `e2e/toolkit.spec.ts` (ring shows 7; keypad conversion, swap,
  HKD, GBP remembered; offline saved vs bundled rates; phrase plays with
  the right `lang`, card, no-Cantonese-voice notice; weather °F/°C, saved
  offline, none saved; pins grouped, exact Maps URLs, address card, own-
  only remove, add with Playwright geolocation → exact insert) + axe
  audits of every Toolkit screen, the phrase card, weather with data and
  the address card. The fake backend aborts the rate and weather services
  in every test (specs that need them answer them).

### Games → Lost in Translation (built, Oct 3 2026)

The ring's **Games** hub (mahjong icon, 7th item) opens
`src/app/(app)/games/index.tsx` — **a spotlight stage, not a ring** (user,
Oct 3 2026: "we don't want to do another rotary menu… a cool hero
animation… have the user select the icons"): the picked game's 3D icon
floats large on a white halo with a sage glow (bob + sway + breathing floor
shadow, off under Reduce Motion), then the title, one line and a Play pill;
a row of icon tiles (`role="tab"`, selected one raised with a sage ring)
picks the game, or swipe across the stage; switching springs the new icon
in with a sparkle burst and a haptic tick. Tapping the big icon also plays.
Each game in `GAMES` (`src/lib/games.ts`) has an `image` —
`assets/images/games/*.png`, generated like the menu icons (Higgsfield Qwen
Image 3, same style prompt, sage in every object; prompts in
`tools/menu-icons/README.md`). Three options were made per game; the
user picked the **instant camera** (Lost in Translation) and the **sage
arcade cabinet** (Godzilla Rampage). **Shared scoring for every game** (user: "eventually
all 5-6 games will have a leaderboard and points"): `game_entries` (a
`game` key + player) and `game_votes` (one per entry per person, never on
your own — enforced by RLS); **points = upvotes received**. A combined
cross-game leaderboard is a sum over the same tables (not built yet).
- **Lost in Translation** (title picked by the user from six; "Engrish"
  avoided on purpose): post a photo of wonky English (library/camera),
  optional caption "What does it say?" (≤ 200, whitespace collapsed), city
  (default today's leg, or "Somewhere else"). Wall with **Top** (votes,
  then newest) / **New** / **Leaderboard** tabs; upvote toggles
  optimistically (rolls back on error); your own find shows its count +
  delete instead of a vote button.
- **Daily winner highlighted** (user asked): per local calendar day, the
  entry with the most upvotes (≥ 1; tie → posted first) gets a gold frame
  and a trophy badge — "Leading today" for today, "Winner · Jun 7" after.
  Highlight only, **no bonus points**. Leaderboard ties share a rank; daily
  wins, then finds, order a tie. New tokens `winner` / `winnerSoft` /
  `winnerInk` (6.8:1).
- **Photos are NOT in the shared gallery** (user: "Don't put photos in
  gallery"): private **`games` bucket** (15 MB images; members read; you
  write only under `<uid>/`), `<uid>/<entry id>.<ext>` + device-made
  `.thumb.jpg`; deleting an entry deletes its row (votes cascade) and both
  files. The insert policy also checks `storage_path` is in your folder.
- **Live schema note:** `game_entries.photo_id` still exists, nullable and
  unused — 0013 first linked entries to gallery photos; the fix-ups
  (0013b/c/d) avoided `DROP COLUMN`/`DROP POLICY` because **destructive
  statements through the Supabase MCP connector hang until timeout** (a
  confirmation that never arrives). Non-destructive DDL (`ALTER POLICY`,
  `ALTER COLUMN … DROP NOT NULL`) went through. The repo's
  `0013_games.sql` is the clean final schema.
- Cached for offline (`game.<key>.entries`, `game.votes`).
- Tests: `e2e/games.spec.ts` (hub; Top order; winner badges for a past
  day and today; own find not votable; vote insert + exact delete query;
  New order; leaderboard ranks/points/ties; posting uploads two files to
  `games` and inserts **no** `gallery_photos` row; delete removes row +
  files) + axe audits of the hub, wall, leaderboard and new-find form.

### Games → Godzilla Rampage (built, Oct 3 2026; 3D voxel art Oct 3 2026)

An arcade platformer from the user's brief: climb girders/ladders while
Godzilla throws barrels, rescue the wife at the top. **Chris** (pickaxe,
from Price, Utah) rescues **Emily**; **Shea** (giant candy cane) rescues
**Heather**. Four levels — Godzilla Rampage (daytime Tokyo), Coal Mine
Chaos, Christmas Chaos (candy-cane girders, snow), Kaiju Showdown (burning
city) — then they loop harder (`1.15^round`).
- **Art direction (user, Oct 3 2026): NOT 8-bit.** "A 2D platformer but
  a more updated 3D art style, like a high-detail Crossy Road." Gameplay
  stays 2D side-on; everything is drawn as a **lit voxel diorama in
  three.js** — chunky voxel models with baked ambient occlusion
  (`voxel.js` mesher), soft shadows, themed scenery pushed back into fog, a
  camera tilted ~10° down. The first pixel-art version is in git history;
  don't go back to it.
- **Source** `assets/games/rampage/`: `index.html` (page, CSS, DOM touch
  pad sized from the viewport via `--u`, TRY AGAIN/CHANGE HERO buttons),
  `game.js` (all game logic in a 192×288 logical playfield, y down; a fixed
  60 Hz step so slow devices don't slow the game), `render3d.js` (scene,
  camera framing — the playfield fills the screen exactly and scenery
  bleeds past it —, lights, per-level looks `LOOK3D`, girders/ladders,
  syncing models to state, particles/weather as instanced cubes),
  `models.js` (characters as jointed part hierarchies, Godzilla with jaw/
  arms/legs/tail/eyes that track you, hazards, tools, crown, hearts), `hud.js`
  (HUD, messages, speech bubbles, select/game-over screens on a 2D canvas
  over the 3D one, chunky rounded type). **The game's colours are game art,
  the one exception to the colour-token rule** — they never leave these files.
- **Build:** `tools/build-rampage.mjs` bundles the modules with **esbuild**
  (three.js 0.169 tree-shaken in; both are devDependencies, only used here),
  inlines the bundle into `index.html` and writes `src/games/rampage/html.ts`
  (~540 KB). **Edit the files in assets/games/rampage, then
  `npm run build:rampage`**; CI runs it with `--check` and fails if html.ts is
  stale. Works offline (no CDN).
- **Software WebGL** (SwiftShader/llvmpipe — CI, some emulators) switches
  to a low-power mode (no shadows, 0.75 pixel ratio, 3D redrawn at most
  ~12×/s so taps stay responsive); `RAMPAGE_INIT.quality
  = 'high'` forces full quality for screenshots. With no WebGL at all the
  game still runs with only the HUD. `playwright.config.ts` launches
  Chromium with `--use-angle=swiftshader --enable-unsafe-swiftshader` so the
  game renders in tests.
- **Host:** `src/app/(app)/games/rampage/index.tsx` (Play card + high-score
  board: each player's best run, ties share a rank) and `play.tsx` (full
  screen, swipe-back off, light status bar) using
  `src/components/games/GameFrame` — `react-native-webview` (13.16.1, the
  SDK's version) natively, a `sandbox="allow-scripts"` iframe `srcDoc` on
  web (null origin: no access to the app's storage/session; it focuses the
  iframe's window on load so keys reach the game). The host swaps
  `/*INIT*/null` (`window.RAMPAGE_INIT`) for `{highScore, debug: __DEV__}`
  (HIGH SCORE = best of the phone's own and the group's saved runs).
  Messages from the game: `ready`, `score {score, level, round, hero,
  outcome}` (once per run, on game over or ✕), `haptic {kind}`
  (`gameHaptic()` in `haptics.ts`), `exit`.
- **Scores:** `0014_game_scores.sql` — `game_scores` (game
  `godzilla_rampage`, user, score 1…9,999,999, level 1–4, round, hero
  chris/shea); members read, insert own, admin deletes. Arcade games score
  themselves; photo games use upvotes. `src/lib/rampage.ts` validates the
  message (`parseRun`), keeps the phone's best (`epicasia.rampage.best`),
  queues runs in `epicasia.rampage.pending` and sends them (`flushRuns`) —
  so a run finished offline goes up on the next save or board visit.
- **Controls (user feedback Oct 3 2026: "a little tough", "easier to climb
  ladders", the ✕ "too close to the directional button"):** the d-pad is
  one touch zone (direction from the thumb's position, slide between arrows,
  diagonals count); ladders grab within `LADDER_REACH` 9 of their centre
  and snap on, climb faster (`CLIMB` 52), and you can step off sideways near
  either end; jump buffering (`JUMP_BUFFER` 0.14 s) and coyote time (0.1 s);
  a little air steering. **Leaving is behind a pause menu** (❚❚ in the pad's
  middle column, or Escape/P): Resume, Sound, Leave game — never one tap
  beside the d-pad.
- `window.__rampage` exposes mode/score/lives/level/hero/hi/player/gl and
  `screenPoint(x, y)` (logical → client px) and `menu` for tests; in
  development `__rampage.debug` adds giveTool, rescue, die, gameOver(score),
  spawnBarrelAt, pause, setLevel, setGodzilla(state), place(x, girder),
  calm() (no hazards).
- **Characters from the user's photos** (`LOOKS` in models.js; likeness is
  face and hair — **user: no sunglasses, outfits needn't match**): Chris —
  shaved head with a shine, blue eyes, stubble, and the **gold crown** from
  one of his photos when he rescues Emily; Emily — big wavy red hair, the
  blue ball gown with black florals; Shea — dark curls swept back from a
  high forehead, hazel eyes, stubble; Heather — blonde chin-length bob with
  a side part, the white gown with pink peonies.
- Tests: `e2e/rampage.spec.ts` (board ranks; play through the iframe —
  WebGL on, pick Shea by tapping, pad + keyboard move, power-up lights
  SWING, game over → exact `game_scores` insert, TRY AGAIN/CHANGE HERO, ✕
  back to the board with the new best, no page errors; offline run saved
  on the next visit; forgiving ladder grab, sliding across the d-pad, pause
  menu — run serially with a 2-minute budget and no screenshots, since
  software 3D is slow on CI runners) + axe audits of the board and the game (inside the
  frame, all buttons ≥ 44). The fake backend's session init script skips
  iframes.

### Flights (built, Sept 30 2026; now shown inside Arrivals)

Same shape as Itinerary: `src/lib/flights.ts` (fetch/create/delete),
the add screen `src/app/(app)/flights/new.tsx` (the list is now Arrivals'
"Your flights"), delete only on your own
rows, no schema change. (A Lodging screen was built alongside it and later
removed at the user's request — see git history if it's ever wanted.)

- **Flights are boarding passes**: IATA codes in Plex Mono, dashed path
  with a plane, a perforation with half-circle notches, confirmation code;
  colored by the arrival airport's leg (`stopForAirport()` /
  `airportName()` in `places.ts`, which knows the route's airports).
  **Times are airport-local wall-clock times**, stored in the
  `timestamptz` columns *as if UTC* (`wallClockISO()`) and always read
  back in UTC (`formatWallClockTime()` / `wallClockDay()` in
  `src/lib/dates.ts`) — so "departs 10:30 in Tokyo" shows 10:30 whatever
  the phone's zone is. Don't format flight times with `toLocale*` or
  local `Date` getters, and don't convert them as real instants. The form
  infers a next-day arrival when the arrival clock time is earlier than
  departure (overridable with an explicit arrival date); the pass shows
  "+1".
- `src/lib/dates.ts` holds the shared day/time parsing (`isValidDay`,
  `parseTimeInput` — moved out of itinerary's `new.tsx`) and formatting.

### Group chat (built, Oct 1 2026)

One room for the whole trip. Data: `src/lib/chat.ts` (fetch/send/react/
delete, signed photo URLs, save/share photo, realtime subscription),
pure helpers in `src/lib/chatFormat.ts`, screen
`src/app/(app)/chat/index.tsx`, components in `src/components/chat/`
(`MessageRow`, `Composer`, `MessageActions` long-press sheet,
`PhotoViewer`, `TypingIndicator`). On the orbit menu as "Group Chat"
(sage rotary-telephone icon, `assets/images/menu/chat.png`).

- **Schema:** migration `0005_group_chat.sql` — `messages` gained
  `image_path`/`image_width`/`image_height`, `reply_to` (self FK, `on
  delete set null`), `deleted_at` (soft delete keeps replies' place),
  `body` nullable with a has-content check and a 4000-char cap;
  `message_reactions` (PK message+user+emoji, own insert/delete,
  `replica identity full` so realtime DELETEs carry the row); both tables
  in the `supabase_realtime` publication; private `chat` storage bucket
  (15 MB, images only; any member reads, uploads only under
  `<own uid>/…`); `realtime.messages` policies so only signed-in members
  can use the private `chat:everyone` broadcast channel (typing).
- **Sending is optimistic:** the client makes the message id (`newId()`),
  shows it at once ("Sending…", then the time; "Not sent · tap to retry"
  on failure) and the realtime echo is matched by id — never re-key
  messages. Photos upload first (`<uid>/<message id>.<ext>`), then the
  row is inserted; a failed insert removes the upload.
- **Photos** are shown via cached signed URLs (1 h); "Save" uses
  `expo-file-system` `File.downloadFileAsync` + `expo-media-library`
  `Asset.create()` — **`saveToLibraryAsync` and the other legacy
  media-library functions throw at runtime in SDK 57**, use the new API.
  Web downloads via a signed URL with `download`. Share uses RN `Share`.
- **List:** inverted `FlatList`, newest first; runs of one sender within
  5 min share one name label/avatar (`sameRun`); day dividers; older
  pages load at the top (`PAGE_SIZE` 40). The empty state lives outside
  the list (an inverted list flips `ListEmptyComponent`).
- **Web gotcha:** RN-web `Modal` with `animationType="fade"` only unmounts
  after its CSS `animationend`; when that doesn't fire, the sheet can never
  reopen — `MessageActions`/`PhotoViewer` use `animationType="none"` on
  web. The composer's height ignores `onContentSizeChange` while empty
  (RN-web reports the textarea's tall scrollHeight).
- **Unread badge** (Oct 2 2026, `0009_chat_unread_push.sql`,
  `src/lib/chatUnread.ts`): `chat_reads.last_read_at` per user, set when
  the chat screen gains and loses focus; home counts others' undeleted
  messages since then (`count: 'exact', head: true`) on focus and bumps
  it live from a realtime INSERT subscription. Shown as a red (`danger`)
  count badge on the Group Chat hub (`OrbitMenuItem.badge`; VoiceOver
  label "Group Chat, N unread").
- **Push notifications** (code + server done; delivery needs the EAS
  build, see Conventions): `src/lib/push.ts` registers the phone's Expo
  push token in `push_tokens` (PK user+token, own rows only) after
  sign-in (`(app)/_layout.tsx`; native only, real devices only, and only
  once `extra.eas.projectId` exists — until `eas init` it silently does
  nothing), deletes it on sign-out, hides the banner for chat pushes
  while the chat is open, and opens the chat when a notification is
  tapped (also from a cold start). After a message saves, the sender's
  app calls the **`notify-chat` Edge Function**
  (`supabase/functions/notify-chat/index.ts`, deployed, `verify_jwt`):
  it reads the message *as the caller* (RLS; only the author can trigger
  it, only within 10 min), then with the function's built-in service role
  reads everyone else's tokens, posts to Expo's push API in chunks of 100
  ("Sarah · Landed at Narita!" / "📷 Photo") and prunes
  `DeviceNotRegistered` tokens. The service role lives only inside the
  function, never in the app. Smoke-tested live: unauthenticated calls get
  401. `tsconfig.json` excludes `supabase/functions` (Deno code).
- **Not built yet:** editing sent messages, multiple rooms, video,
  per-person mute.
- **Tests:** `e2e/chat.spec.ts` (empty state, runs/replies/reactions,
  exact insert bodies, long-press react + reply) on the fake backend,
  which now returns inserted rows for `.select()`, records PATCH/DELETE,
  and closes the realtime websocket so nothing touches the live project.

### Photos — shared gallery (built, Oct 1 2026)

`src/lib/gallery.ts` (photos, favorites, upload/delete/caption, realtime),
shared photo plumbing in `src/lib/photos.ts` (read bytes, **device-made
thumbnails** via `expo-image-manipulator` — Supabase image transforms are
a paid feature —, upload original + `.thumb.jpg`, per-bucket cached signed
URLs, save-to-Photos / share; the chat uses it too), screen
`src/app/(app)/photos/index.tsx`, viewer
`src/components/gallery/GalleryViewer.tsx`. Menu item "Photos" (instant
prints icon, `assets/images/menu/photos.png`).

- **Schema:** `0006_shared_gallery.sql` — `gallery_photos` gained
  `bucket` ('gallery' | 'chat'), `thumb_path`, `width`/`height`,
  `message_id` (unique, `on delete cascade`), caption ≤ 1000 + an
  owner/admin update policy; `messages.image_thumb_path`;
  `photo_favorites` (PK photo+user, own insert/delete); both in realtime;
  **the `gallery` bucket was made private** (it was public-read), uploads
  only under `<own uid>/…`.
- **Chat → gallery is a database trigger** (`private.chat_photo_to_gallery`,
  security invoker so RLS still applies): a photo message inserts a
  gallery row pointing at the *same* object in the `chat` bucket (no copy);
  soft-deleting the message removes it. Verified live in a rolled-back
  transaction as an authenticated user. Deleting a chat-sourced photo
  from the gallery only removes the gallery row; gallery uploads also
  delete their files.
- **UX:** 3-column grid grouped by local day with sticky headers + counts;
  filter chips (All, Favorites, Mine, From chat, one per uploader);
  multi-select upload from the library (up to 30, 2 concurrent, progress
  card) or the camera; long-press to enter select mode → Save all /
  Delete (own gallery uploads only); viewer with swipe paging (arrows on
  web), iOS pinch-zoom (`ScrollView maximumZoomScale`), thumbnail shown
  instantly with the original fading in (`expo-image` `placeholder`),
  byline + "From chat" tag, ♥ with count, Save, Share, Delete, editable
  caption for your own photos. `expo-image` with `cacheKey` =
  `bucket:path`, so photos stay cached across the hourly signed-URL
  rotation.
- **Gotcha fixed:** the viewer asks for originals in an effect; that
  callback must be stable and `setUrls` must return `prev` when nothing
  changed, or it's an infinite render loop (it hung the page on web).
- **Not built yet:** "taken at" from EXIF (photos sort by upload time),
  albums, video, bulk share.

### Journal (built, Oct 2 2026)

Personal trip journal with **voice memories, photos and a printable photo
book**. Data `src/lib/journal.ts`; screens `src/app/(app)/journal/`
(`index` list, `new`, `[id]` — your own entry opens in the editor, someone
else's shared entry opens read-only in `JournalReader` — and `book`);
components `src/components/journal/` (`JournalEditor`, `JournalReader`,
`VoiceRecorder`, `VoiceNote`). On the ring as "Journal".

- **Schema:** `0007_journal.sql` — `journal_entries` gained `title`,
  `day` (date, default today), `city`, `updated_at`, length caps;
  `journal_media` (photo | audio per entry: paths, size, `duration_ms`,
  caption, `position`; owner writes, readable when the entry is shared);
  private `journal` bucket (50 MB, images + audio) at
  `<uid>/<entry id>/<media id>.<ext>`, owner writes, and anyone signed in
  may read a file once its entry is shared. **Applied as three migrations
  (0007a/b/c)** — one `apply_migration` call with the whole file timed out
  twice (nothing applied); smaller parts went through. The repo keeps the
  single file.
- **Editor:** trip-day chips (Jun 5–19 + today; the city follows the
  day's leg via `stopForDay()` in `places.ts` until you type your own),
  where, serif title, story, photos (library/camera, thumbnails made on
  device like the gallery), voice notes, and a "Share with the group" row
  that *is* the switch (a drawn toggle — a real `Switch` nested in a
  pressable row fails axe as nested controls). Save uploads new files
  first, then rows; removed media are deleted with their files; "Discard
  changes?" on close.
- **Recording** (`VoiceRecorder`): `expo-audio` `useAudioRecorder`
  (HIGH_QUALITY + metering, level ring), 5 min max, mic permission via
  `requestRecordingPermissionsAsync`, `setAudioModeAsync({ allowsRecording:
  true, playsInSilentMode: true })` while recording and `allowsRecording:
  false` after (else iOS routes playback to the earpiece). Native files
  are `.m4a` (`audio/mp4`), web `.webm`. `app.json` has the `expo-audio`
  plugin + mic text, and expo-image-picker's `microphonePermission` is now
  a string (it was `false`, which would strip the Info.plist key).
- **Photo book** (`src/lib/photoBook.ts`, user picked "printable PDF"):
  8×8 in pages — cover (first photo, wordmark + seal, author, dates,
  route), a divider page per leg in its color, then each of *your own*
  entries in trip order (kicker date · city, title, story, photos as one
  big or a 2-up grid, voice-note cards), and a closing seal page. Photos
  are embedded as data URIs (downloaded, resized to 1400px on device).
  **A voice note prints as a QR code** to a signed URL valid 10 years
  for that one file (`qrcode-generator`) — anyone with the printed QR can
  play that note; that's the trade-off for a book that keeps working.
  Native: `expo-print` `printToFileAsync` (576×576) → renamed PDF →
  `expo-sharing` share sheet. Web: the button opens a tab synchronously
  (popup blockers) and the book HTML is written into it and printed
  (`expo-print`'s web `printToFileAsync` just prints the current page).
  Colors come from theme tokens. Fonts are Google Fonts with Georgia /
  system fallbacks (offline printing falls back cleanly).
- **Not built yet:** speech-to-text transcripts of voice notes (needs a
  native speech module or a server), reordering media by drag, a photo
  viewer inside entries, choosing which entries go in the book.
- **Tests:** `e2e/journal.spec.ts` — empty state, list by day + "From
  the group" tab, read-only shared entry, exact insert body for a new
  entry, edit/remove media, book screen counts, **the book's HTML
  structure** (cover/leg/entry pages, QR per voice note, only your own
  entries), and **a real recording** with Chromium's fake microphone
  (record → play label → caption → upload path `.webm` → media row).
  The fake backend now applies simple `eq`/`neq`/`in` filters and
  answers `.single()`/`.maybeSingle()`; later also `gt`/`is` filters,
  exact counts (with `Content-Range` exposed — without
  `access-control-expose-headers` the browser hides it and the count reads
  as null), and records Edge Function calls (`backend.functions`).

### Profile (built, Oct 2 2026)

`src/app/(app)/profile.tsx` (opened from the home avatar): your photo
(library, camera on native, remove), name, email, Sign out (asks first,
via `src/lib/confirm.ts`). Data `src/lib/profile.ts`: the photo is
center-cropped to a 512px square JPEG on the device and uploaded to the
private `avatars` bucket as `<uid>/<new id>.jpg` (a new name every time,
so no stale cached face), then `profiles.avatar_url` (from 0001 — it holds
the storage *path*) points at it and the old file is deleted. Renaming
updates both `profiles.display_name` and the auth user's
`user_metadata.display_name` (the home greeting reads the latter).
`src/components/Avatar.tsx` shows a photo or initials-on-person-color,
and is used on home, chat message rows and the chat header faces
(`fetchMembers()` now returns `avatar`). `FormField` now passes its label
as the input's `accessibilityLabel` (axe caught an unlabeled input).
Tests: `e2e/profile.spec.ts` (rename → exact PATCH + auth update, a real
photo pick via the file chooser → upload path + row, sign-out confirm);
the fake backend now answers `PUT /auth/v1/user` and records storage
uploads (`backend.uploads`, `backend.authUpdates`).

### Offline (built, Oct 2 2026)

Trip data stays readable with no signal (mainland China, metro, dead hotel
Wi-Fi). `src/lib/offline.ts`: `cached(name, fetcher)` wraps the reads in
the data libs — itinerary, flights, members, the latest chat page +
reactions, the newest gallery page + favorites, journal (mine + shared),
profile, documents; each success is saved in AsyncStorage as
`epicasia.cache.<uid>.<name>`. A read that fails — **or is still pending
after 3.5s** — returns the saved copy and flags offline; without a saved
copy it waits for / rethrows the real result. (supabase-js retries a
failed GET 3× with 1s/2s/4s backoff, so a dead connection takes ~7s to
fail — hence the 3.5s cut-off; the late read still refreshes the saved
copy.) Itinerary and flights also `peek()` the saved copy on open, so they
appear instantly online too. `fetchEntry` falls back to the saved journal
lists. **Photos offline:** signed URLs are kept in
`epicasia.cache.signedUrls`; with signing unavailable the last (even
expired) URL is handed back, and expo-image serves the photo from its disk
cache because its `cacheKey` is `bucket:path`, not the URL. `OfflineNotice`
("Offline · showing what was saved today 1:03 PM", ink on `warningSoft`,
`useSyncExternalStore` on the offline flag) sits under the header of
itinerary, flights, chat, photos and journal. **Sign-out deletes every
saved copy** (`clearOfflineCopies`). Not offline yet: writing (adding
items, sending messages — chat's retry covers sends), photos never opened
before, voice notes. Tests: `e2e/offline.spec.ts` (load online, abort all
database + signing requests, reload: itinerary/flights/confirmation code/
photo grid still show with the note; nothing saved → no fake data;
sign-out clears; axe on the note).

`src/components/form/` (`FormField`/`FormButton`/`FormScreen`) started as
`src/components/auth/Auth*` — renamed once it became clear they're generic
form primitives needed well beyond login/register (itinerary's `new.tsx`
already reuses them). Reuse them for future add/edit forms rather than
rebuilding input/button/screen chrome per feature.

## Stack

Expo (React Native + TypeScript), file-based routing via **Expo Router**.
Routes live in `src/app/` (configured via the `expo-router` plugin's `root`
option in `app.json` — not the default `app/`). Non-route code (components,
hooks, utils) goes in `src/components/`, `src/hooks/`, etc., alongside
`src/app/`, never inside it.

Target platform is iOS first; the web build (`npm run web`) exists for fast
iteration and Playwright-driven visual checks, not as a shipped product.

**Backend: Supabase** (Postgres + Auth + Storage). Chosen over replicating
reunion-app's homegrown Node+SQLite backend because this app needs
multi-user accounts, group-shared data, and per-user file storage
(documents/photos) from day one — Supabase gets that with far less custom
backend code.

- Client: `src/lib/supabase.ts` (`createClient` with AsyncStorage session
  persistence — required on React Native, unlike web). Needs
  `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY` set as
  environment variables (Expo only inlines `EXPO_PUBLIC_*` vars into the
  client bundle — anything without that prefix is invisible to app code).
  The module throws at import time if either is missing, on purpose — fail
  loud, not with a silent broken client. Never use the `service_role` key
  anywhere in this app; it bypasses every RLS policy below.
- Schema + RLS: `supabase/migrations/0001_init.sql` (initial schema),
  `0002_hide_internal_functions.sql`, `0003_perf_indexes_and_policy_tuning.sql`,
  `0004_itinerary_seed_rows.sql` (nullable `created_by`, FK `on delete set null`),
  `0005_group_chat.sql` (chat photos/replies/reactions/realtime — see Group chat),
  `0006_shared_gallery.sql` (gallery + favorites + chat→gallery trigger — see Photos),
  `0007_journal.sql` (journal entries/media + private `journal` bucket — see Journal),
  `0008_avatars.sql` (private `avatars` bucket + display-name length — see Profile),
  `0009_chat_unread_push.sql` (`chat_reads`, `push_tokens` — see Group chat),
  `0010_trip_invites.sql` (invite codes required at sign-up — see Auth),
  `0011_travel_documents.sql` (My documents columns + bucket limits — see My documents),
  `0012_map_pins.sql` (shared map pins — see Toolkit),
  `0013_games.sql` (game entries/votes + private `games` bucket — see Games),
  `0014_game_scores.sql` (arcade runs — see Godzilla Rampage).
  **Applied** to project `rjywjnidmjpfcjymaavi` via the Supabase MCP
  connector (`mcp__Supabase__apply_migration`) — the connector is connected
  for this account, so use it directly for future schema changes rather
  than hand-pasting SQL into the Dashboard. After any DDL change, run
  `mcp__Supabase__get_advisors` (both `security` and `performance` types) —
  it caught three real issues after 0001 that 0002/0003 fixed: internal
  `SECURITY DEFINER` helper functions were auto-exposed as public PostgREST
  RPC endpoints (fixed by moving them to a non-exposed `private` schema —
  safe because Postgres resolves existing policy/trigger references by the
  function's OID, not by re-parsing the schema-qualified name, so moving
  schemas doesn't break them), RLS policies calling `auth.uid()` directly
  instead of `(select auth.uid())` (re-evaluated per row instead of once
  per query), and two tables with multiple permissive policies for the same
  role+action (consolidated into one policy each). As of the last check,
  the security advisor's one standing WARN — "Leaked Password Protection
  Disabled" — is a **Pro-plan-only** Supabase feature and this project is on
  the free plan (user confirmed Oct 1 2026), so ignore it rather than
  suggesting it again. Otherwise both advisor reports are clean except INFO-level "unused index"
  findings on the indexes 0003 just added — expected and not a real issue,
  since the tables are still empty; don't remove those indexes over it.
  Also caught two real bugs while first writing 0001 (before it was ever
  run): a `user_id` column referenced on tables that only have
  `created_by`, and an `is_admin` self-protection check using a
  same-statement subquery that would have always passed — fixed with a
  `BEFORE UPDATE` trigger instead, since only OLD/a same-table subquery
  inside a trigger reliably sees the pre-update row.
- Auth: login/register/forgot-password screens built (`src/app/(auth)/`),
  gated by `src/lib/AuthProvider.tsx` (session state from
  `supabase.auth.getSession()` + `onAuthStateChange`) — `(app)/_layout.tsx`
  redirects to `/(auth)/login` without a session, `(auth)/_layout.tsx`
  redirects to `/(app)` with one, root `src/app/index.tsx` redirects to
  whichever applies. Client uses the **PKCE** auth flow (`flowType: 'pkce'`
  in `src/lib/supabase.ts`), not the older implicit flow, since it's the
  recommended choice for native apps with deep links. `is_admin` on
  `profiles` plus the `protect_is_admin` trigger is the `checkAdmin()`
  equivalent — a non-admin can never set `is_admin` on any row (including
  their own) via a client update, only an existing admin can, and only
  Postgres enforces it (not app code), so it holds even if the client is
  compromised or bypassed entirely.
  **Sign-up is closed: an invite code is required** (Oct 2 2026, user
  choice "invite code which can be email or QR"; `0010_trip_invites.sql`,
  applied as 0010a/0010b). `trip_invites` (code like `K7QM-2XPA` generated
  in the database by `private.new_invite_code()` from `gen_random_bytes`,
  no 0/O/1/I; optional label, `max_uses`, `expires_at`, `revoked_at`;
  admin-only RLS). `private.handle_new_user()` now reads
  `raw_user_meta_data.invite_code`, counts a use on a current code and
  **raises otherwise, so the sign-up fails** — enforced for direct Auth API
  calls too; existing accounts unaffected. Supabase surfaces that as
  "Database error saving new user", which the register screen turns into
  "That invite code isn't valid any more…" (`isInviteRejection`).
  Verified live in a block that raised at the end (so it all rolled back):
  admin creates a 1-use code → sign-up with it (lower-case) makes the
  profile and counts the use → reuse refused → no code refused → a
  non-admin sees 0 codes; afterwards 0 invites, users/profiles unchanged.
  App: `src/app/(app)/invites.tsx` (Profile → "Invite travelers", admins
  only): create a code (who it's for, 1/5/15/unlimited uses, 7/30 days or
  no expiry), each active code shown big in Plex Mono with a **QR code**
  (`src/components/QrCode.tsx`, `qrcode-generator` → react-native-svg) of
  the invite link, **Share** (message), **Email** (`mailto:` with subject
  + body), **Copy**, **Turn off**; inactive codes listed below. Register
  (`(auth)/register.tsx`) has an "Invite code" field, pre-filled from
  `/register?invite=CODE` and normalized (`k7qm2xpa` → `K7QM-2XPA`).
  **The invite link is always the public site** (`src/lib/site.ts`:
  `PUBLIC_SITE` = `EXPO_PUBLIC_SITE_URL` or `https://epicasia.vercel.app`)
  `/register?invite=…`. **Fixed Oct 2 2026 after travelers' links failed:**
  it used to fall back to `Linking.createURL`, i.e. on web whatever address
  the organizer was browsing — and Vercel's per-deployment/team URLs
  (`epicasia-…-allen-trailmarks.vercel.app`) redirect anyone not logged in
  to Vercel to a Vercel SSO page; only `epicasia.vercel.app` is public.
  Auth emails were the second failure: every confirmation/reset link in the
  logs had `redirect_to=http://localhost:3000` (Supabase's default Site
  URL). Sign-up now sends `emailRedirectTo: <site>/login?confirmed=1`
  (login shows "Your email is confirmed"), forgot-password
  `authReturnUrl('/reset-password')` (site on web, `epicasia://` natively).
  **Supabase must allow-list them** (Authentication → URL Configuration:
  Site URL `https://epicasia.vercel.app`, Redirect URLs
  `https://epicasia.vercel.app/**` and `epicasia://**`) — otherwise it
  silently falls back to the Site URL. **Done by the user Oct 3 2026.** Tests in `invites.spec.ts` pin the
  shared link and the sign-up `redirect_to`.
  Tests: `e2e/invites.spec.ts` + axe audits of the invite and register
  screens.
  **Register → email confirmation → login → sign out is verified live**
  against the real project (this container's network policy was widened to
  allow `*.supabase.co` — see the egress note below): signUp correctly
  triggers `handle_new_user()` (confirmed a matching `profiles` row appears
  with the right `display_name`/`is_admin: false`), Supabase does require
  email confirmation on this project (`signUp` returns a user with no
  session, login correctly fails with "Email not confirmed" until it's
  confirmed), and after simulating confirmation
  (`update auth.users set email_confirmed_at = now()` — exactly what
  clicking the email link does) login/sign-out both work end-to-end. The
  test account was deleted afterward (`auth.users`/`profiles` both back to
  0 rows). forgot-password's request screen also reaches Supabase for real
  (hit its email rate limit on a second send — a real 429, correctly
  displayed, not a bug).
  **`src/app/reset-password.tsx` (the deep-link landing page after clicking
  a password-reset email) is still NOT end-to-end verified** — that
  specifically needs a real device receiving a real email and tapping the
  link to open the app via its `epicasia://` scheme, which no amount of
  server-side SQL simulation substitutes for. It's written against the PKCE
  `?code=` param shape and calls `exchangeCodeForSession` — reasoned through
  carefully, and consistent with how the rest of the now-verified PKCE flow
  behaves, but unconfirmed for this one specific screen. If it doesn't work
  when actually tested, start by logging the incoming URL from
  `Linking.useURL()` to see its real shape.
- New tables beyond `profiles` (itinerary_items, flights, lodging, messages,
  expenses/expense_shares, gallery_photos, packing_items, documents,
  journal_entries) all follow one of two shapes: **shared** (any
  authenticated trip member can read/insert; only the creator or an admin
  can update/delete) or **personal** (owner-only via `user_id = auth.uid()`
  on every operation) — `journal_entries` is personal but adds one extra
  `select` policy for rows with `shared_to_group = true`.
- `trip_invites` (admin-only) gates sign-up — see the Auth bullet.
- Storage: six buckets — `games` (private, any member reads, own folder writes; see Games), `avatars` (private, any member reads, own folder writes; see Profile), `journal` (private, per-user, see Journal), `chat` and `gallery` (both private, any member
  reads via signed URLs, uploads only under own uid folder; see Group chat
  / Photos) and
  `documents` (private, RLS-gated so a user can only touch objects under a
  `<their-uid>/...` path prefix via `storage.foldername(name)`; images + PDF
  ≤ 20 MB since 0011 — see My documents).

## Design tooling

`DESIGN.md` at the repo root is a machine-readable companion to this
section (colors/type/component tokens in YAML frontmatter + prose), created
via `npx getdesign@latest add claude` and then **fully rewritten** to
describe Epic Asia's actual tokens — the tool's "claude" preset generates a
generic demo based on Claude.com's own marketing-site brand (cream canvas +
coral + serif), completely unrelated to this app; don't regenerate it
without immediately re-customizing it the same way, or a future session may
mistake the generic preset for this project's real direction.

`.agents/skills/` (13 skills from `Leonxlnx/taste-skill`, symlinked into
`.claude/skills/`) are installed and committed — general frontend-design-
taste skills (anti-slop layout/typography/motion guidance), not Epic-Asia-
specific. `impeccable` (a similar tool) could not be installed in this
container — see the GitHub access scoping note under Testing.

Also vendored (Sept 30 2026, all MIT, copied from the repos' default
branches): `.agents/skills/ui-ux-pro-max` (nextlevelbuilder/ui-ux-pro-max-skill
@09170ee — only the core skill, not its brand/slides/banner siblings; its
`scripts/tests` were dropped; query it with
`python3 .agents/skills/ui-ux-pro-max/scripts/search.py "<query>" --domain
<style|color|typography|ux|...>`, the `react-native` stack file applies here),
`.agents/skills/design-motion-principles` (kylezantos/design-motion-principles
@4a9ca87 — motion create/audit; its examples are web/Framer Motion, so
translate to RN `Animated`/native driver), both symlinked into
`.claude/skills/`. Also `.agents/skills/find-skills` (vercel-labs/skills
@3694740, MIT, Oct 1 2026 — searching/installing skills via `npx skills
find`/`add`; installing project skills with that CLI should follow the same
vendor-into-`.agents/skills/` + symlink pattern, not `-g`, which lands in
the ephemeral container's home folder). `.agents/references/awesome-claude-design/`
(rohitg00/awesome-claude-design @7f60ee5) is a reference library of
DESIGN.md examples by aesthetic family plus recipes — **not a skill** and
not this app's direction; `DESIGN.md` at the root stays authoritative. The
"design.md Chrome" extension the user asked about is a browser extension
(e.g. TypeUI's DESIGN.md Style Extractor) that must be installed in their
own Chrome — nothing to install in the repo.

## Design direction

**Light and natural** (Sept 29 2026) — modeled on two reference mockups the
user supplied (airy travel apps: misty sky backgrounds, white rounded cards
with soft shadows, a sage-green primary, a friendly serif headline like
"Where are we going, Jake?", and photo-led destination cards). History, so
nobody re-litigates it: lacquer red/jade "travel journal" → charcoal + brass
→ navy + amber (matching the "Asia Disney Adventure" artifact,
https://claude.ai/artifact/Cpu7mN9wmq6c3LbjQh1NcT) → navy + vermilion/gold
("B+") → **this**. The dark palettes are gone from the code (git history
has them).

- **Fixed light, not adaptive.** `useTheme()` always returns `colors`
  (`src/theme/colors.ts`); `app.json` `userInterfaceStyle` is `"light"`,
  background `#f3f1ea`, StatusBar `dark`.
- **Color = semantic tokens only** (Oct 1 2026, user asked for semantic
  colors). `src/theme/colors.ts` is the ONLY place a raw color value may
  appear — components ask for a role (`inkTertiary`, `danger`,
  `onMediaSecondary`, `bubbleMine`, `skeleton`, `scrim`…), never a hex or
  rgba literal (grep `src/` outside `src/theme/` should find none). Add a
  token rather than inline a color; its header comment records every
  contrast ratio, keep it current. Groups: surfaces, lines, text
  (`ink`/`inkSecondary`/`inkTertiary` — tertiary `#646f67` is the faintest
  text that passes AA), action (`accent` `#4a7256` for fills = `highlight`
  for text/lines, `accentPressed`, `accentSoft`, `accentDisabled`), status
  (`success`/`warning`/`danger`/`info` + `…Soft`), brand/illustration,
  chat bubbles, media (dark photo viewers). Paper `#f3f1ea`, white cards,
  ink `#1e2721`. The ONLY warm chrome color is `seal` vermilion `#c8452f`
  (the 旅 hanko) — don't spread it.
  **Leg colors come in two shades:** `legColors` are FILLS (rails, day
  circles, dots — ≥ 3:1); any TEXT in a leg's color uses `legTextColors`
  (`legTextForCity()`, or `textShadeOf(fill)`) — ≥ 4.6:1. `personColors`
  (avatars, chat names) all carry white initials at ≥ 5.2:1.
- **No subheaders / meta lines** (user decision, Oct 1 2026: "I don't need
  subheader text"). Screen headers are the title alone — no counts
  ("6 photos · 1 from chat", "2 travelers"), no trip summaries ("15 days ·
  14 nights"), no form subtitles, no menu captions under the orbit label
  (the caption is now only the VoiceOver hint). Don't add them back.
- **Loading = skeletons, never spinners** (`src/components/Skeleton.tsx`):
  `TimelineSkeleton` (itinerary), `PassSkeleton` (flights),
  `ChatSkeleton` (+ two `Bone`s as the "loading older" footer), and
  `GridSkeleton` (photos), built from `Bone`s in the shape of the real
  content. One shared soft pulse per skeleton (native driver), still under
  Reduce Motion; announced as one `progressbar` "Loading …" element,
  `testID="skeleton"`. New list screens get a matching skeleton. The only
  remaining `ActivityIndicator` is inside `FormButton` while saving.
- **Elevation:** soft diffuse shadows via `boxShadow` strings in `shadow`
  (`card`, `float`) — supported on iOS/Android/web in RN 0.86. Borders are
  near-invisible; separation comes from shadow + white-on-paper.
- **Shape:** generous radii — cards 20–24, inputs 16, primary buttons are
  54px pills (radius 27), round 44px white `CircleButton`s for header
  actions (back, add).
- **Sky backdrop** (`src/components/SkyBackdrop.tsx`): pale blue-grey sky
  fading into the paper background with a few soft clouds — first child of
  every top-level screen (FormScreen without a hero, home, itinerary, the
  intro). Gradient ids come from `useId()`: on web, stacked screens stay in
  the DOM and a duplicate `url(#id)` pointing into a hidden screen paints
  nothing.
- **Photos** (`src/lib/places.ts`, `assets/images/places/`): real photos
  of the trip's places, taken from the user's trip-plan artifact and
  resized to ≤1100px. `STOPS` (five legs with dates/colors/photo) drives the
  home "Your route" cards (`PlaceCard.tsx`); `photoForDay()` picks an
  itinerary thumbnail. Login/register use `FormScreen`'s `hero` photo
  header (Kinkaku-ji / Great Wall). **RN-web gotcha:** a cover `Image`
  needs explicit width/height — with `absoluteFill` it renders a zoomed-in
  corner.
- **Brand lockup** — always `<Wordmark size={…} />`: "Epic *Asia*" (italic
  in green) + the `<Seal>` hanko (static SVG path of 旅 from Noto Serif JP
  900, no CJK font loaded). A View row, so never nest it inside `<Text>`;
  `FormScreen`'s `title` accepts a node for this reason.
- **Type** (`src/theme/typography.ts`): Newsreader (serif 400 + italic,
  500) for display — headlines, screen titles, the selected menu label;
  Work Sans for everything else (labels are sentence case, not tracked
  caps); IBM Plex Mono only for boarding-pass data (airport codes, the
  intro HUD, dial bearings). Each weight is its own family — never use
  `fontWeight`. Fonts load in `src/app/_layout.tsx` behind
  `expo-splash-screen`.
- **Launch sequence** (`src/components/LaunchSequence.tsx`) — **"little
  planet"** (Sept 30 2026, replaced the line-art 360° dial intro at the
  user's request, modeled on a tiny-planet travel graphic they supplied):
  a miniature sage-grass world (`assets/images/launch/planet.png`) turns
  ~300° clockwise into place while 8 trip landmarks
  (`assets/images/launch/*.png` — fairytale castle for Tokyo Disney, Meiji
  torii, Kinkaku-ji, Tōdai-ji + deer, Great Wall, Temple of Heaven, Pearl
  Tower, Big Buddha) spring up from behind its horizon as each crosses the
  upper-left; a 3D-rendered silver airliner circles it in perspective; then
  the Wordmark + dates rise in beneath and it all fades (~5.4s). Art is
  generated in the menu icons' style (see `tools/menu-icons/README.md`).
  Shown on every cold open; tap anywhere ("Skip intro" label, which the e2e
  helper relies on) skips; reduce-motion shows the finished scene still.
  **Abbreviated intro after the first view — built (Oct 2 2026).**
  `src/lib/introPrefs.ts` decides per cold open: **full** the first time
  ever, after each app update (`expo.version` differs from the stored
  `epicasia.introSeenVersion`) and once on the trip's first day
  (2027-06-05); **short** otherwise; **none** when `epicasia.introSkip`
  is set (the accessibility mode). The root layout keeps the splash up
  until both fonts and the mode are known. The short variant
  (`<LaunchSequence variant="short">`, `SHORT_MS` 1500): the world
  already turned into place fades/settles in, the landmarks ripple up
  45ms apart, the plane flies 30% of its orbit, the wordmark rises, then
  the usual fade. Tap-to-skip and the reduce-motion path work in both.
  Tests: `e2e/intro.spec.ts` (full + flag written, short finishes on its
  own, new version → full, skip flag → none).
  Implementation notes, so they aren't re-learned:
  - Three layers share the world's placement: landmarks (rotating) →
    planet (rotating) → a **static** SVG sunlight/rim-shade overlay. The
    landmarks sit *behind* the planet and sink `0.24·L` into it so the
    planet hides the front of each grass base — drawn on top they read as
    stuck-on discs. The static shading keeps the light from spinning with
    the ground (the planet image has baked lighting).
  - Each landmark hangs on a full-size "arm" View rotated to its angle, so
    it rotates about the planet's center with no transform-origin tricks.
  - Pop times are computed by inverting the spin's bezier (bisection), so
    each spring fires exactly as its landmark crosses the gate angle.
  - **The plane is a pre-rendered 3D sprite** (`plane-sheet.png`: 36
    views, one per 10° of heading, of the three.js airliner in
    `tools/menu-icons/index.html`, rendered by `render-plane.mjs` with the
    camera `PLANE_ELEV` = 26° above a level orbit, light fixed in the
    world, banked into the turn, props as blurred discs). It flies the whole
    orbit; the sheet frame is round(orbit angle / 10°), stepped exactly via
    duplicated interpolate breakpoints, so it is nose-on coming round the
    left and tail-on going away on the right. It's drawn behind the world
    on the far half and in front on the near half, switching at the ellipse
    ends (outside the planet) where both copies show the same frame. Never
    mirror/flip a flat sprite instead — that looked fake (user feedback);
    change `PLANE_ELEV` only together with a re-render.
  - **Planet art must have no strong-perspective features** (no paths,
    lakes or anything "seen from above"): they looked like flat stickers
    and wrong once rotated (user feedback). The current planet is a calm,
    light sage meadow with a few trees/stones that follow the curve; a busy
    evenly-bumped version read as a pollen/virus ball.
  - The timeline starts only after all 10 images fire `onLoad` (1.5s
    fallback), so nothing pops in blank. Only transforms/opacity animate,
    native driver throughout.
  - **Web dev-server gotcha:** in this container Metro sometimes keeps
    serving a stale bundle after edits — if a screenshot doesn't change,
    restart `expo start --web --clear` (kill it by PID; `pkill -f "expo
    start"` also matches the calling shell and kills it). The image viewer
    can also show a cached copy of a re-written PNG path — write each
    capture to a new filename.
- **Home = one page, no scrolling** (user, Oct 1 2026): wordmark +
  avatar, the greeting, the trip line, and the orbit menu filling the rest.
  The "Your route" place cards were removed (and `PlaceCard` deleted);
  **The avatar (your photo or initials) opens Profile**, where Sign out
  now lives (it was an account card behind the avatar).
- **Home = orbit menu** (`src/components/OrbitMenu.tsx`, items in `MENU`
  in `src/app/(app)/index.tsx`): the intro's 360° ring reused as the main
  navigation. Spaced out at the user's request: hubs 96pt, ellipse
  `rx = min(0.4·width, 190)` and `ry = RY_RATIO·rx` (0.485 — 0.5, then "tilt 3% more"; flattened
  from up to 0.66 on Oct 2 2026, user: "tilted slightly so it's more
  ellipse"; squeezed to ≥ 0.36 only on short screens), far hubs shrink to
  0.44 and fade to 0.16. **The ring's centre sits at the screen's centre**
  (user: it "sits low on iPhone"): `measureInWindow` gives the menu's
  offset, `cy = windowH/2 − top`, clamped so the far hubs and the
  label/Open button stay inside the view. Swipe left/right to turn it (PanResponder → `rotation`
  Animated.Value measured in items, unbounded, wrapped with
  `Animated.modulo`; spring-snaps to the nearest item, one extra item max
  for a fast flick); the front hub is selected — tap it or "Open …" to
  navigate, tap a side hub (or ‹ ›) to turn it to the front. No dial or
  bearing readout (removed at the user's request).
  - **Hubs** are AI-generated (Higgsfield, Qwen Image 3) hyper-real
    miniature objects, cut out to transparent 360×360 PNGs
    (`assets/images/menu/*.png`): rolled map with sage ribbon + brass
    compass, brass immigration stamp + open sage passport (Arrivals; it
    replaced the silver prop airliner), ryokan with sage noren
    and bonsai, sage leather journal with
    cherry blossoms, mahjong tiles on a sage felt board, sage enamel
    rotary telephone (Group Chat), instant photo prints with a sage clip
    (Photos). (The ryokan icon went with Lodging.) **No clouds** (the
    user rejected objects on clouds) and **sage green worked into every
    object** (user asked for it, ties to `accent`). Two code-rendered sets
    (cartoony, then "rustic") were rejected before this. Regenerate/re-cut
    via `tools/menu-icons/` (README has the prompts and picks).
  - **Gold connector:** one `Animated.View` segment per neighbouring pair,
    pre-sampled like the hubs (midpoint, length via `scaleX`, unwrapped
    angle via `rotate`, depth → opacity), drawn under the hubs. It is ONLY
    a translucent gold band + blurred `boxShadow` glow — the user removed
    the solid gold core line, don't add it back. Brightens while dragging
    (`glow` value).
  - **Feedback** (`src/lib/feedback.ts`): every step, in either direction,
    = click sound + haptic tick; opening = firmer tap + "tock". Kept
    deliberately quiet (the user asked for a softer click): native
    volume 0.35/0.4, web peak gain ~0.05. Sounds:
    native `src/lib/sound.ts` plays `assets/sounds/tick.wav`/`confirm.wav`
    (generated for this app) via `expo-audio`, respecting the silent switch
    and mixing with music; web `sound.web.ts` synthesizes the same sounds
    with Web Audio (unlocked on first tap). Haptics `src/lib/haptics.ts`:
    `expo-haptics` natively; on web the Vibration API or, on iOS Safari
    18+, a hidden `<input type="checkbox" switch>` click (needs a user
    gesture, hence ticks fire from the rotation listener inside the drag's
    touch handler, not from an effect).
  - **Web gotcha:** RN-web fires a child Pressable's `onPress` even after
    the parent PanResponder captured the gesture as a drag, so presses
    within 350ms of a drag end are ignored (`justDragged`).
- **Itinerary** is a timeline: a rail with weekday + a leg-colored day
  circle and a dashed connector, and one white card per item (title,
  date · city in the leg color, description, a photo thumbnail on the
  day's first card), under a trip summary card.
- Icons: `@expo/vector-icons` (Ionicons outline), sparingly.
- Respect safe-area insets (`react-native-safe-area-context`).

## Accessibility baseline (WCAG 2.2 AA — audited Oct 1 2026)

`e2e/a11y.spec.ts` runs axe-core (`@axe-core/playwright`, tags
wcag2a/aa, 21a/aa, 22aa) on every signed-in screen (home, itinerary + add,
arrivals + guides + documents + add flight, chat, photos, journal, profile…) plus the open photo viewer and the chat
long-press sheet, and fails on any control smaller than **44×44 pt**. All
pass. What the audit fixed, so the rules stick:
- **Every `Pressable` gets `accessibilityRole="button"`** (plus a label if
  it has no text) — without it VoiceOver doesn't say "button" and the web
  build doesn't expose it as one. A message bubble is the exception (its
  label + "long press for…" hint describe it).
- **Real 44pt hit areas, not `hitSlop`.** RN-web drops `hitSlop`, so the
  spec can't see it; small icons sit in a 44×44 box with negative margins
  (`iconHit` on the trash icons, `reactionHit` on reaction pills, orbit
  arrows, text buttons `minHeight: 44`). Filter chips, composer buttons,
  viewer buttons and the home avatar are 44. The orbit's back hub is kept
  ≥ 44 by its depth scale (`0.46 + 0.76·depth`).
- Decorative images inside a labeled control get `accessibilityLabel=""`
  (expo-image → `alt=""`).
- Reply quotes inside my green bubble darken (`bubbleMineQuote` is black
  14%) — the old white tint dropped white text to 4.06:1.
- Headers carry `accessibilityRole="header"`.
Not checkable here (needs a device): VoiceOver order/announcements,
Dynamic Type at accessibility sizes, the fold — see the planned
accessibility mode.

## Testing

Playwright (`e2e/`, config in `playwright.config.ts`) drives the **web**
build as a fast smoke test for layout/logic — it uses Chromium with an
iPhone 14 viewport, not WebKit, so it is not a Safari-fidelity check. Real
iOS behavior (gestures, haptics, native modules) must be verified in Expo
Go or the iOS Simulator/a real device, not this suite.

Run:
```bash
npm run test:e2e     # starts the web server itself, runs e2e/*.spec.ts
```

**Signed-in screens are tested against a fake backend**
(`e2e/support/fakeBackend.ts`): it plants an unexpired fake session in
localStorage (supabase-js restores it with no network call) and answers
every `*.supabase.co` request in-test — table GETs from fixture rows,
POSTs recorded so a spec can assert the exact insert body; storage
signed-URL requests are answered too and every photo is served from a
bundled trip photo, so grids/viewers render real images. Nothing reaches
the live project and no test account is created, so prefer this over live
sign-ups (see the bounce warning below). Every page load plays the launch
sequence over the screen: skip it by clicking the "Skip intro" label and
wait for it to unmount (`open()` in each spec) —
otherwise `toBeVisible()` still passes on content hidden under the intro
and screenshots show the intro. Flight specs run with
`timezoneId: 'America/Los_Angeles'` to prove times don't shift.

**Lint + CI (set up Oct 2 2026).** `npm run lint` (ESLint 9 flat config,
`eslint.config.js` = `eslint-config-expo` + three React Compiler rules
switched off — `react-hooks/refs`, `purity`, `use-memo` — because the app
doesn't use the compiler and they flag the standard
`useRef(new Animated.Value(0)).current` pattern; the config says so.
`set-state-in-effect` stays on and its three hits were fixed (derive
state, or React's adjust-during-render pattern in `GalleryViewer`).
Edge Functions (Deno) are ignored; `tools/*.mjs` get Node globals.
`npm run typecheck` (`tsc --noEmit`; `tsconfig.json` excludes
`supabase/functions`). Both must stay at zero problems.
**GitHub Actions** `.github/workflows/ci.yml` on push to `main` and on
PRs: job 1 `npm ci` → typecheck → lint; job 2 installs Playwright's
Chromium and runs the whole e2e suite with **placeholder**
`EXPO_PUBLIC_SUPABASE_*` values (the fake backend answers everything, so
CI needs no secrets — verified locally with the same placeholders), and
uploads `test-results/` on failure. No Prettier config — match the
existing style (single quotes, ~120 cols) by hand or with
`npx prettier --single-quote --print-width 120`.

**Container note:** in this cloud dev environment, `npx expo install` fails
outright (not just skips its optional compatibility check) because the
sandbox's egress proxy blocks the React Native Directory API it calls. Use
plain `npm install <pkg> --legacy-peer-deps` here instead, and cross-check
version compatibility against the installed `expo` SDK manually. This is a
container limitation, not a project convention — `expo install` is still
correct and should work normally outside this sandbox.

**GitHub access scoping note:** this session's proxy only allows
unauthenticated `git clone`/`fetch` of public repos and `WebFetch` of
github.com pages by default — direct HTTP calls to `api.github.com` (or
`github.com/.../releases/...`) for a repo that isn't explicitly attached
return a 403 from the proxy itself, not from GitHub. This broke `npx
impeccable install` (it fetches a signed release bundle via the GitHub API).
Fix is `add_repo` for the specific owner/repo first; for a public repo this
only grants read-level API access, not push — don't over-grant just to
unblock a CLI's asset download if `push` access would be excessive for what
you actually need.

**⚠️ Never sign up test accounts with a made-up `@gmail.com` (or any real
mail-provider domain) address.** Doing this during earlier live-testing
triggered a real Supabase bounce-rate warning email to the project owner,
threatening to restrict the project's email-sending privileges — Gmail's
servers actively bounce mail to addresses that don't exist, and enough
bounces trip Supabase's abuse detection. This is a materially different
failure mode from using `@example.com` (which Supabase rejects outright as
an invalid domain before ever attempting delivery, so it *can't* bounce) —
`@example.com` is the safe choice for testing signup validation, but it
can't be used to test the full confirm/login flow since Supabase won't
send it a real email either. If the full email round-trip genuinely needs
testing again: use a "+"-alias of a real inbox the user actually controls
(e.g. `theirrealaddress+test1@gmail.com` — Gmail delivers this to the base
inbox, so it can't bounce), and confirm with the user first rather than
picking an address unilaterally. Every test account created this way so
far has been cleaned up afterward (`auth.users`/`profiles` both back to 0
rows each time) — but the bounce had already been sent by the time cleanup
happened, since it fires on delivery attempt, not on account lifetime.

**Supabase network-egress note (resolved):** this container's network
policy originally returned a 403 from the proxy itself (not from Supabase)
for direct outbound HTTPS to `*.supabase.co` — confirmed via
`curl -x "$HTTPS_PROXY" .../auth/v1/settings` getting "CONNECT tunnel
failed, response 403". The environment's network access level was widened
to "Full" to fix this (environment settings — same dialog as the
`EXPO_PUBLIC_*` env vars), after which the same curl got a real 401 from
Supabase instead of a proxy block, and live signup/login/sign-out all
verified working (see the Auth bullet above). This was separate from (and
never affected) the Supabase MCP connector's schema tools
(`apply_migration`, `get_advisors`, etc.) — those run server-side through
Anthropic's connector infrastructure regardless of this container's network
policy, which is exactly why schema changes always worked even before the
network was widened. If a future session's network is back to a narrower
policy and this resurfaces, that's the fix. Unlike the env-var change
(which needed a new session), the network-policy change took effect in the
already-running session immediately.

When testing Supabase calls from a Playwright script in this container,
route Chromium through the proxy explicitly — it doesn't inherit
`HTTPS_PROXY` from the environment the way `curl`/Node's fetch do.
`chromium.launch({ proxy: {...} })`'s `bypass` option didn't route
localhost correctly in one attempt; passing `--proxy-server=`/
`--proxy-bypass-list=<local>;localhost;127.0.0.1` as raw Chromium `args`
did. Also needed: `--ignore-certificate-errors`, since the proxy
TLS-terminates with its own CA (`/root/.ccr/ca-bundle.crt`) that Chromium
doesn't trust by default the way the system CA store does for other tools.

**Playwright browser-version note:** this container has Chromium
pre-installed at a fixed revision (via `PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers`,
no download). `@playwright/test` is pinned to `1.56.1` in `package.json` to
match that revision — bumping the Playwright version without also updating
(or removing) the container's pre-installed browser will break `npx
playwright test` here with an "Executable doesn't exist" error.

## Conventions

- No native `ios/`/`android/` dirs are committed (Continuous Native
  Generation) — configure native behavior via `app.json` and config plugins
  only.
- `EAS` (not local Xcode/Android Studio) is the build path. **Configured
  Oct 2 2026, not yet run** (the user has no Expo or Apple Developer
  account yet): `eas.json` (profiles `development` with `expo-dev-client`,
  `preview` internal, `production` with `autoIncrement`; `cli.
  appVersionSource: remote`; each profile names its EAS `environment`, which
  must hold `EXPO_PUBLIC_SUPABASE_URL`/`_ANON_KEY`), `app.json`
  `ios.infoPlist.ITSAppUsesNonExemptEncryption: false`, the
  `expo-splash-screen` plugin (paper background + the planet art),
  `expo-notifications`, and `expo-audio` with background playback/recording
  **off** (it defaulted to an `audio` UIBackgroundModes entry the app
  doesn't need). Verified by `expo prebuild --platform ios` in a scratch
  copy: Info.plist has every permission string, the export flag, no
  background modes; entitlements have `aps-environment`. **App icon** is
  now real (`assets/icon.png`, composed from the intro art: planet +
  castle + torii + Kinkaku-ji + the plane, sky-to-paper background; the
  Expo placeholder is gone), plus matching splash, Android adaptive
  foreground/monochrome and favicon. **The user's step-by-step guide is
  `docs/iphone-build.md`** (Apple Developer $99/yr, Expo account, `eas
  init` → commit projectId, `eas env:create`, `eas build`, `eas submit`,
  TestFlight external group + public link, Supabase redirect
  `epicasia://**`, on-device checklist). **TestFlight builds expire after
  90 days — rebuild in Apr–May 2027 before the June trip.** If an
  `EXPO_TOKEN` secret is ever added to the environment, `eas` can run from
  here.

## Web deploy (Vercel)

`vercel.json` builds the web version with `npx expo export --platform web`
into `dist/` and rewrites every path to `index.html` (single-page app).
`.npmrc` sets `legacy-peer-deps=true` so a plain `npm install` (what Vercel
runs) resolves the same way as local installs. The two `EXPO_PUBLIC_SUPABASE_*`
vars must be set in Vercel's project settings — Expo bakes them into the
bundle at build time, so changing them needs a redeploy. **The public
address is `https://epicasia.vercel.app`** (production alias); every other
Vercel URL for the project is behind Vercel Deployment Protection (SSO), so
never hand those to travelers. It must also be Supabase Auth's Site URL +
redirect URL (see the Auth bullet) so confirmation and password-reset
emails land on the app.

### Web app icon ("Add to Home Screen") — Oct 2 2026

User picked option **A, "little planet"** from six mockups (planet, paper
crane, entry stamp, 旅 hanko, "Ea" monogram, wordmark): a sage grass world
with a vermilion torii, golden pagoda and snowy Fuji on top and a silver
prop plane circling, on a misty sky. Master art `assets/pwa-icon.png`
(1024², Qwen Image 3, prompt in `tools/menu-icons/README.md`; the model
baked rounded corners in, so it's cropped 4.5% to full bleed). Expo's web
build uses **`public/index.html` as its page template when it exists**
(copied from the CLI's default, plus the head tags) and copies everything
in `public/` to the output: `apple-touch-icon.png` (180), `icons/
icon-192.png`, `icon-512.png`, `icon-maskable-512.png` (art at 80% with a
feathered edge over a gradient from the art's four corner colours — a
blurred copy of the art showed a ghost planet), `manifest.webmanifest`
(standalone, portrait, paper `#f3f1ea`), Apple web-app meta tags, and the
favicon (`assets/favicon.png`, 48px of the same art). Chromium reports the
manifest error-free. Vercel serves real files before its SPA rewrite, so
the rewrite doesn't swallow them. `e2e/pwa.spec.ts` checks the links and
that every icon is served. The **native** app icon (`assets/icon.png`) is
still the older composed planet; the user hasn't asked to change it.

## Sign-in persistence ("Keep me signed in for 30 days")

`src/lib/rememberMe.ts`, checked once at startup in `AuthProvider`. Login
has a checkbox, on by default. Checked: session kept 30 days
(`epicasia.rememberUntil`) and the email is pre-filled next time. Unchecked:
signed out when the app is closed (native: module flag reset on cold start;
web: a `sessionStorage` marker, so a reload keeps you in but a new tab or
browser restart doesn't). Sessions from before this feature get a fresh 30
days rather than a sign-out. Passwords are never stored by the app: the
email field is `textContentType`/`autoComplete` = `username` and the
password field `password`, so iCloud Keychain and browser password managers
offer to save them.
