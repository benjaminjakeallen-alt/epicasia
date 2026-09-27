@AGENTS.md

# Epic Asia

iOS group-trip app for an upcoming Asia trip. Same shape as the Robinson
reunion app (individual logins, password reset, admin functions) but for
trip logistics instead of a family reunion.

## Planned feature set

Shared (all trip members, editable by all or an organizer role):
- Itinerary (day-by-day, grouped by day/city), Flights, Lodging
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
- Schema + RLS: `supabase/migrations/0001_init.sql`. **Not applied via CLI
  migrations** (no Supabase connector/service-role access from this
  environment) — it's meant to be pasted into the Supabase Dashboard's SQL
  Editor and run by hand. Written to be idempotent (`drop policy if exists`
  before every `create policy`, `create table if not exists`) specifically
  so a partial failure can be fixed and re-run safely. **This file has been
  reasoned through carefully but never executed against a real Supabase
  project** — if you hit an error running it, read the error rather than
  assuming the file is correct; two real bugs were already caught this way
  during writing (a `user_id` column referenced on tables that only have
  `created_by`, and an `is_admin` self-protection check that used a
  same-statement subquery that would have always passed — fixed with a
  `BEFORE UPDATE` trigger instead, since only OLD/a same-table subquery
  inside a trigger reliably sees the pre-update row).
- Auth: login/register/password-reset screens not yet built. `is_admin` on
  `profiles` plus the `protect_is_admin` trigger is the `checkAdmin()`
  equivalent — a non-admin can never set `is_admin` on any row (including
  their own) via a client update, only an existing admin can, and only
  Postgres enforces it (not app code), so it holds even if the client is
  compromised or bypassed entirely.
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
