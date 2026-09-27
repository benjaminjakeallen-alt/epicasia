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
backend code. Not yet wired up (no project created yet as of this writing).
Auth needs: login/register, password reset, and an admin role — same shape
as reunion-app's `is_admin` column + `checkAdmin()` gate, implemented via
Supabase Auth + a Postgres RLS policy instead of a hand-rolled check.

## Design direction

Deliberate departure from "generic iOS app" toward **travel-realistic,
Asian-inflected, not cartoonish** — no dragons/bamboo-border pastiche, just
restrained color and materials evoking travel journals and lacquerware.

- **Color** (`src/theme/colors.ts`, `useTheme()` hook): warm paper
  background (`#F7F1E6` light / `#161310` dark), lacquer red as the primary
  accent, jade and brushed gold as secondary accents, warm ink instead of
  pure black/white for text. Both light and dark palettes are mandatory for
  every screen (`userInterfaceStyle: "automatic"` in `app.json`) — use
  `useTheme()`, never hardcode a color.
- **Type** (`src/theme/typography.ts`): Fraunces (serif, via
  `@expo-google-fonts/fraunces`) for large titles and section headers only —
  the one deliberate deviation from the system font. Body/UI copy stays on
  the system font (San Francisco on iOS) for native feel and performance.
  Fonts are loaded in `src/app/_layout.tsx` behind `expo-splash-screen`
  (`preventAutoHideAsync`/`hideAsync`) — never render text in `type.display`
  before `useFonts` resolves.
- Icons: `@expo/vector-icons` (Ionicons), used sparingly for section/row
  affordances, not decorative.
- iOS grouped-list / Settings-app layout language for list-based screens
  still applies (rounded card containers, `hairlineWidth` separators,
  chevron rows) — it's the color/type/iconography that changed, not the
  structural patterns.
- Respect safe-area insets (`react-native-safe-area-context`) — every
  top-level screen wraps in `SafeAreaProvider` (done once in
  `src/app/_layout.tsx`) and reads insets where needed instead of hardcoding
  status-bar-height padding.
- Prefer spring-physics transitions over linear easing once real navigation
  and gestures are added (not yet wired up).

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
