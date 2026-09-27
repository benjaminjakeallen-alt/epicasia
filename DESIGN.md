---
version: alpha
name: Epic-Asia
description: A minimal-luxury, fixed-dark interface for a group trip to Asia — closer to a private-aviation or five-star-hotel app than a generic cross-platform UI. Charcoal surfaces, one brass/gold accent, a Playfair Display serif wordmark reserved for titles only, system sans everywhere else. The app does not follow the device's light/dark setting — dark is the one signature brand appearance.

colors:
  background: "#0B0B0C"
  card: "#17171A"
  border: "#28282C"
  separator: "#232326"
  ink: "#F2EFE9"
  ink-secondary: "#A7A29A"
  ink-tertiary: "#6C6862"
  accent: "#C9A24B"
  accent-pressed: "#AD8A3E"
  on-accent: "#171208"

typography:
  wordmark:
    fontFamily: "PlayfairDisplay_600SemiBold, serif"
    fontSize: 40px
    lineHeight: 48px
  large-title:
    fontFamily: "PlayfairDisplay_600SemiBold, serif"
    fontSize: 32px
    lineHeight: 38px
  title:
    fontFamily: "PlayfairDisplay_600SemiBold, serif"
    fontSize: 22px
    lineHeight: 28px
  subtitle:
    fontFamily: "system"
    fontSize: 15px
    lineHeight: 20px
    letterSpacing: 0.2px
  body:
    fontFamily: "system"
    fontSize: 17px
    lineHeight: 22px
  caption:
    fontFamily: "system"
    fontSize: 12px
    lineHeight: 16px
    letterSpacing: 1.2px

rounded:
  card: 14px

spacing:
  screen-h: 20px
  row-v: 15px
  row-h: 16px

components:
  grouped-card:
    backgroundColor: "{colors.card}"
    borderColor: "{colors.border}"
    rounded: "{rounded.card}"
  list-row:
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    iconColor: "{colors.accent}"
    chevronColor: "{colors.ink-tertiary}"
    separatorColor: "{colors.separator}"
  eyebrow-label:
    textColor: "{colors.accent}"
    typography: "{typography.caption}"
---

## Overview

Epic Asia is **fixed dark, not adaptive** — `useTheme()` always returns the
dark palette regardless of the device's system setting (`app.json`'s
`userInterfaceStyle` is `"dark"`). This was a deliberate correction after an
earlier direction (a lacquer-red/jade/gold "travel journal" palette with
light+dark variants) read as themed and cartoonish rather than premium. Dark
charcoal + a single brass accent, committed to as the one brand appearance —
the way Robinhood or Uber Black don't reskin for light mode — reads as
considered rather than decorative.

**Key characteristics:**
- Near-black charcoal background (`{colors.background}` — #0B0B0C), slightly
  lighter charcoal cards (`{colors.card}` — #17171A). No pure black, no pure
  white text.
- Exactly **one** accent color: brass/gold (`{colors.accent}` — #C9A24B).
  Resist adding a second or third accent — that was the mistake in the
  discarded direction.
- Playfair Display serif reserved for the wordmark and titles only — every
  other line of text is the system font (San Francisco on iOS). This split
  is the one deliberate typographic flourish; don't extend the serif to
  body copy or UI labels.
- iOS grouped-list / Settings-app structure for list content: a rounded
  card container, hairline separators between rows, chevron affordances —
  not custom card shadows or elevation.

## Colors

- **Background** (`{colors.background}` — #0B0B0C): the screen floor.
- **Card** (`{colors.card}` — #17171A): grouped-list containers.
- **Border** (`{colors.border}` — #28282C): card outline (hairline width).
- **Separator** (`{colors.separator}` — #232326): between rows inside a card.
- **Ink** (`{colors.ink}` — #F2EFE9): primary text — warm off-white, never
  pure white.
- **Ink Secondary** (`{colors.ink-secondary}` — #A7A29A): subtitles, muted
  copy.
- **Ink Tertiary** (`{colors.ink-tertiary}` — #6C6862): chevrons, the least
  prominent text/icon tone.
- **Accent** (`{colors.accent}` — #C9A24B): row icons, the eyebrow label,
  interactive/brand moments. Used sparingly — it should read as a rare
  material (brass), not a UI-wide highlight color.
- **Accent Pressed** (`{colors.accent-pressed}` — #AD8A3E): press state for
  accent-colored controls.

There is a reserved, unused `lightColors` palette in `src/theme/colors.ts`
for a possible future user-facing theme toggle — nothing reads it today.
Don't wire it up without being asked.

## Typography

Font loading happens once in `src/app/_layout.tsx` via `useFonts` from
`@expo-google-fonts/playfair-display`, gated behind `expo-splash-screen`
(`preventAutoHideAsync`/`hideAsync`) — never render `{typography.wordmark}`,
`{typography.large-title}`, or `{typography.title}` text before fonts
resolve, or it silently falls back to a system font substitute mid-render.

| Token | Size | Font | Use |
|---|---|---|---|
| `{typography.wordmark}` | 40px | Playfair Display 600 | The "Epic Asia" launch-sequence wordmark |
| `{typography.large-title}` | 32px | Playfair Display 600 | Screen-level titles (e.g. the home screen's "Epic Asia") |
| `{typography.title}` | 22px | Playfair Display 600 | Section headers |
| `{typography.subtitle}` | 15px | System | Screen subtitles |
| `{typography.body}` | 17px | System | List rows, default body text |
| `{typography.caption}` | 12px, tracked +1.2px | System, uppercase | Eyebrow labels (e.g. "UNITED STATES → ASIA") |

## Components

**`grouped-card`** — The one content container pattern so far: rounded
14px, hairline border in `{colors.border}`, background `{colors.card}`.
Holds a list of `list-row`s.

**`list-row`** — Icon (Ionicons outline, `{colors.accent}`) + label
(`{typography.body}`, `{colors.ink}`) on the left, chevron
(`{colors.ink-tertiary}`) on the right. Rows separate with a hairline
`{colors.separator}` line except after the last row. 15px vertical / 16px
horizontal padding.

**`eyebrow-label`** — Small tracked-caps accent-colored line above a title
(e.g. "UNITED STATES → ASIA" above "Epic Asia"). `{typography.caption}` in
`{colors.accent}`.

## Launch Sequence

Not a static screen — `src/components/LaunchSequence.tsx` is a one-time
animated intro shown on every cold app open (tap anywhere to skip): an SVG
flight path (quadratic bezier, `react-native-svg`) draws itself from a
"USA" marker to an "ASIA" marker while a rotating plane icon travels along
it, then fades into the `{typography.wordmark}` "Epic Asia" title. Built on
plain React Native `Animated` (not `react-native-reanimated`, to avoid its
worklets/Babel-plugin setup) — see that file's comments before changing the
path geometry, since the plane/label positions share the SVG's raw
coordinate space rather than a percentage-based one.

## Do's and Don'ts

### Do
- Keep the palette to background / card / one accent. If a new screen seems
  to need a second accent color, that's a sign to reconsider the design,
  not add a color token.
- Reserve the serif for titles/wordmark; everything else is system font.
- Follow the grouped-list pattern (rounded card, hairline separators,
  chevron rows) for any new list-shaped content.

### Don't
- Don't reintroduce light-mode adaptation without being explicitly asked —
  dark is the fixed brand appearance.
- Don't add cultural/thematic motifs (the earlier lacquer-red/jade
  direction was explicitly rejected for reading as themed rather than
  premium).
- Don't add drop shadows/elevation for depth — differentiation comes from
  the card-vs-background color step, not shadows.

## Known Gaps

This file only documents what's actually built (a home screen + launch
sequence) — it intentionally does not invent components for unbuilt
screens (itinerary, flights, chat, etc. from the planned feature set in
`CLAUDE.md`). Extend this file as those screens are actually implemented,
following the established color/type/component conventions above rather
than introducing new ones per-screen.
