@AGENTS.md

# Epic Asia

iOS group-trip app for an upcoming Asia trip. Same shape as the Robinson
reunion app (individual logins, password reset, admin functions) but for
trip logistics instead of a family reunion.

## Planned feature set

Shared (all trip members, editable by all or an organizer role):
- **Itinerary — built** (day-by-day, grouped by day/city, see below),
  **Flights — built**, **Lodging — built** (see below)
- Group chat (reuse reunion-app's polling-based pattern)
- Expense splitting — who paid, who owes, settle-up view
- Shared photo gallery

Personal (per-user, not shared):
- Packing list, Documents wallet (passport/visa/insurance — private,
  offline-available), Journal (optionally postable to the group)

Utilities (client-side/API only, no backend needed):
- Currency converter, offline phrasebook, weather, saved map pins

**Planned (archived, not started): Accessibility mode for low vision,
tailored to the unfolded iPhone Fold.** Requested Sept 30 2026 for a
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

Explicitly deferred: gamification/points/trivia (was reunion-specific,
revisit later if wanted).

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

### Flights & Lodging (built, Sept 30 2026)

Same shape as Itinerary: `src/lib/flights.ts` / `src/lib/lodging.ts`
(fetch/create/delete), list + add screens under `src/app/(app)/flights/`
and `src/app/(app)/lodging/`, delete only on your own rows, no schema
change (the 0001 tables already had every field). Both are on the home
orbit menu.

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
- **Lodging is grouped by leg** (`STOPS`, which now carry
  `checkIn`/`checkOut`): a stay goes under the leg its city names
  (`stopForCity()`), else the leg its check-in falls in, else
  "Elsewhere". A leg with no stay shows a dashed "Add a stay in …" card
  that opens the form pre-filled with that city and dates (route params).
  Addresses open Apple Maps on iOS (works in mainland China, Google Maps
  doesn't) and Google Maps on web/Android.
- `src/lib/dates.ts` holds the shared day/time parsing (`isValidDay`,
  `parseTimeInput` — moved out of itinerary's `new.tsx`) and formatting.

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
  `0004_itinerary_seed_rows.sql` (nullable `created_by`, FK `on delete set null`).
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
  both advisor reports are clean except 10 INFO-level "unused index"
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
- Storage: two buckets, `gallery` (public read, any member can upload) and
  `documents` (private, RLS-gated so a user can only touch objects under a
  `<their-uid>/...` path prefix via `storage.foldername(name)`).

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
`.claude/skills/`. `.agents/references/awesome-claude-design/`
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
- **Color:** warm paper background `#f3f1ea`, white cards, ink `#1e2721`
  (green-black) with `inkSecondary`/`inkTertiary`. One action color, sage
  green `accent` `#4f7a5c` (fills: buttons, selected states) with the same
  value as `highlight` (text/lines) — two tokens kept so they can diverge.
  `accentSoft` for tinted pills. The ONLY warm color is `seal` vermilion
  `#c8452f` (the 旅 hanko and the intro's REC dot) — don't spread it.
  `legColors` (one per trip leg, deepened to read on white) +
  `legColorForCity()` for itinerary rails and landmark/menu icons.
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
  **Planned (archived, not started): abbreviated intro after the first
  view** (user request, Sept 30 2026). The full ~5.4s sequence should play
  only the first time; later cold opens get a short version that reaches
  the app quickly (e.g. ~1.5s: the finished planet fades in already
  settled, a brief settle/landmark shimmer and one plane pass, wordmark,
  out). Persist a "seen intro" flag (AsyncStorage, like `rememberMe.ts`),
  keep tap-to-skip and the reduce-motion path, and consider replaying the
  full version occasionally (e.g. once per new app version or on trip
  day). The accessibility mode (below, under Planned feature set) should
  skip the intro entirely.
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
- **Home = orbit menu** (`src/components/OrbitMenu.tsx`, items in `MENU`
  in `src/app/(app)/index.tsx`): the intro's 360° ring reused as the main
  navigation. Swipe left/right to turn it (PanResponder → `rotation`
  Animated.Value measured in items, unbounded, wrapped with
  `Animated.modulo`; spring-snaps to the nearest item, one extra item max
  for a fast flick); the front hub is selected — tap it or "Open …" to
  navigate, tap a side hub (or ‹ ›) to turn it to the front. No dial or
  bearing readout (removed at the user's request).
  - **Hubs** are AI-generated (Higgsfield, Qwen Image 3) hyper-real
    miniature objects, cut out to transparent 360×360 PNGs
    (`assets/images/menu/*.png`): rolled map with sage ribbon + brass
    compass, silver prop airliner with sage tail, ryokan with sage noren
    and bonsai, sage leather steamer trunk, sage leather journal with
    cherry blossoms, mahjong tiles on a sage felt board. **No clouds** (the
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
POSTs recorded so a spec can assert the exact insert body. Nothing reaches
the live project and no test account is created, so prefer this over live
sign-ups (see the bounce warning below). Every page load plays the launch
sequence over the screen: skip it by clicking the "Skip intro" label and
wait for it to unmount (`open()` in `flights-lodging.spec.ts`) —
otherwise `toBeVisible()` still passes on content hidden under the intro
and screenshots show the intro. Flight specs run with
`timezoneId: 'America/Los_Angeles'` to prove times don't shift.

**Lint is not set up yet**: `npx expo lint` installs eslint +
`eslint-config-expo` and edits `package.json` on first run, then reports
~40 pre-existing errors (LaunchSequence, reset-password). Don't let that
side effect ride along in an unrelated commit; setting lint up properly is
its own task. No Prettier config either — match the existing style
(single quotes, ~120 cols) by hand or with
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
- `EAS` (not local Xcode/Android Studio) is the intended build path —
  `eas build`, `eas submit`, `eas update`. Not yet configured.

## Web deploy (Vercel)

`vercel.json` builds the web version with `npx expo export --platform web`
into `dist/` and rewrites every path to `index.html` (single-page app).
`.npmrc` sets `legacy-peer-deps=true` so a plain `npm install` (what Vercel
runs) resolves the same way as local installs. The two `EXPO_PUBLIC_SUPABASE_*`
vars must be set in Vercel's project settings — Expo bakes them into the
bundle at build time, so changing them needs a redeploy. After the site
URL exists, set it as Supabase Auth's Site URL + a redirect URL so
confirmation and password-reset emails land on the app.

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
