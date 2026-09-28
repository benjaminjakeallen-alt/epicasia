@AGENTS.md

# Epic Asia

iOS group-trip app for an upcoming Asia trip. Same shape as the Robinson
reunion app (individual logins, password reset, admin functions) but for
trip logistics instead of a family reunion.

## Planned feature set

Shared (all trip members, editable by all or an organizer role):
- **Itinerary — built** (day-by-day, grouped by day/city, see below), Flights, Lodging
- Group chat (reuse reunion-app's polling-based pattern)
- Expense splitting — who paid, who owes, settle-up view
- Shared photo gallery

Personal (per-user, not shared):
- Packing list, Documents wallet (passport/visa/insurance — private,
  offline-available), Journal (optionally postable to the group)

Utilities (client-side/API only, no backend needed):
- Currency converter, offline phrasebook, weather, saved map pins

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

**Real trip content exists and needs seeding.** The user has an actual
itinerary already drafted as a Claude Artifact ("Asia Disney Adventure") —
a 14-day plan, Tokyo → Kyoto/Nara → Beijing → Shanghai → Hong Kong, June
6–19, 2027, three families/13 travelers, four Disney park days. It was
extracted once (day/title/city/description for all 14 days) but not yet
inserted, because `itinerary_items.created_by` is a required FK to a real
`profiles` row and no real user account existed at the time. Once the user
has a real account, seed these via `mcp__Supabase__execute_sql` (fast,
accurate) rather than asking them to retype 14 entries through the form —
re-read the artifact (`https://claude.ai/artifact/Cpu7mN9wmq6c3LbjQh1NcT`)
for the exact data if this wasn't done in the same session that extracted
it.

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
  `0002_hide_internal_functions.sql`, `0003_perf_indexes_and_policy_tuning.sql`.
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

## Design direction

**Minimal luxury, fixed dark theme** — like a five-star hotel or
private-aviation app, not a generic cross-platform UI and not themed/
cartoonish "Asian" motifs. Superseded an earlier lacquer-red/jade/gold
"travel journal" direction that read as themed rather than premium; that
palette is gone from the codebase.

- **The app does not adapt to system light/dark mode.** `useTheme()`
  (`src/theme/useTheme.ts`) always returns `darkColors` — dark is the one
  signature brand appearance, the way many premium apps (Robinhood, Uber
  Black) commit to a single look rather than following the OS setting.
  `app.json`'s `userInterfaceStyle` is `"dark"` (forces dark regardless of
  the device setting). `lightColors` still exists in `src/theme/colors.ts`
  in reserve for a possible future user-facing theme toggle, but nothing
  reads it today — don't wire it up without being asked.
- **Color** (`src/theme/colors.ts`): near-black charcoal surfaces
  (`#0B0B0C` background, `#17171A` cards), a single brass/gold accent
  (`#C9A24B`), warm off-white ink instead of pure white. One accent color
  only — resist the urge to add more.
- **Type** (`src/theme/typography.ts`): Playfair Display (serif, via
  `@expo-google-fonts/playfair-display`) for the "Epic Asia" wordmark and
  section titles only — the one deliberate deviation from the system font.
  Body/UI copy stays on the system font (San Francisco on iOS). Fonts load
  in `src/app/_layout.tsx` behind `expo-splash-screen`
  (`preventAutoHideAsync`/`hideAsync`) — never render `type.display`/
  `type.wordmark`/`type.largeTitle`/`type.title` text before `useFonts`
  resolves.
- **Launch sequence** (`src/components/LaunchSequence.tsx`): shown on every
  cold app open (not just first install), tap-anywhere to skip. Animates a
  plane along an SVG quadratic-bezier path from a "USA" marker to an "ASIA"
  marker, then fades in the wordmark. Pure `react-native` `Animated` API +
  `react-native-svg` — deliberately not `react-native-reanimated`, to avoid
  its worklets/Babel-plugin setup (which conflicted with other deps when
  tried). If the path/plane coordinates ever need to change, keep `MAP_SIZE`
  equal to the SVG `viewBox` — the plane and labels are positioned in that
  same raw coordinate space, not a percentage-based one, so they'd drift
  out of sync with the path otherwise.
- Icons: `@expo/vector-icons` (Ionicons), used sparingly for section/row
  affordances, not decorative.
- iOS grouped-list / Settings-app layout language for list-based screens
  still applies (rounded card containers, `hairlineWidth` separators,
  chevron rows).
- Respect safe-area insets (`react-native-safe-area-context`) — every
  top-level screen wraps in `SafeAreaProvider` (done once in
  `src/app/_layout.tsx`) and reads insets where needed instead of hardcoding
  status-bar-height padding.
- Prefer spring-physics transitions over linear easing once real navigation
  and gestures are added (not yet wired up beyond the launch sequence).

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

**Container note:** in this cloud dev environment, `npx expo install` fails
outright (not just skips its optional compatibility check) because the
sandbox's egress proxy blocks the React Native Directory API it calls. Use
plain `npm install <pkg> --legacy-peer-deps` here instead, and cross-check
version compatibility against the installed `expo` SDK manually. This is a
container limitation, not a project convention — `expo install` is still
correct and should work normally outside this sandbox.

**Known web-only console warning:** `LaunchSequence.tsx`'s animated flight-path
draw-on effect uses `Animated.createAnimatedComponent(Path)` from
`react-native-svg`. On the web target this logs a "Received `false` for a
non-boolean attribute `collapsable`" console error — confirmed via isolation
testing to come from that library's `AnimatedComponent` wrapper leaking a
React Native-only view-flattening hint (`collapsable`) into the DOM, which
has no such attribute. This **cannot occur on iOS** (no DOM exists there) and
is not a bug in this app's code — don't spend time re-diagnosing it, and
don't remove the animated path effect over it.

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
