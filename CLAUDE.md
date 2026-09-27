@AGENTS.md

# Epic Asia

iOS trip-planning app for an upcoming Asia trip. Individual screens for
itinerary, flights, lodging, packing list, and a trip journal.

## Stack

Expo (React Native + TypeScript), file-based routing via **Expo Router**.
Routes live in `src/app/` (configured via the `expo-router` plugin's `root`
option in `app.json` — not the default `app/`). Non-route code (components,
hooks, utils) goes in `src/components/`, `src/hooks/`, etc., alongside
`src/app/`, never inside it.

Target platform is iOS first; the web build (`npm run web`) exists for fast
iteration and Playwright-driven visual checks, not as a shipped product.

## Design direction

"World-class iOS-native feel," not generic cross-platform UI:

- System font (`-apple-system`/San Francisco via RN's default font stack) —
  don't override with a custom font unless explicitly asked.
- `userInterfaceStyle: "automatic"` in `app.json` — the app must support
  light and dark mode from day one. Any new screen needs both color sets
  (see the `lightColors`/`darkColors` pattern in `src/app/index.tsx`).
- iOS grouped-list / Settings-app visual language for list-based screens:
  rounded card containers, `hairlineWidth` separators, chevron rows.
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
