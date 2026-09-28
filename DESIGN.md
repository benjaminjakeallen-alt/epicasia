---
version: alpha
name: Epic-Asia
description: A premium, fixed-dark group-trip app for Japan, China and Hong Kong. Deep navy "night flight" surfaces, vermilion fills and antique-gold lines, an Instrument Serif wordmark locked up with a red 旅 seal stamp. Matches the "Asia Disney Adventure" trip-plan artifact, pushed toward East Asian red & gold. The app does not follow the device's light/dark setting.

colors:
  background: "#0a1d38"
  card: "#123059"
  card-raised: "#173a6b"
  border: "rgba(214,168,92,0.32)"
  separator: "rgba(255,255,255,0.08)"
  ink: "#f3f6fa"
  ink-secondary: "#a8bedd"
  ink-tertiary: "#6f89ac"
  accent: "#c8372d"
  accent-pressed: "#a52b22"
  highlight: "#d6a85c"
  on-accent: "#fbf3e6"
  error: "#ef6b6b"
  leg-tokyo: "#c9577a"
  leg-kyoto: "#d9a15b"
  leg-beijing: "#4f8fe0"
  leg-shanghai: "#6fae8f"
  leg-hong-kong: "#7b83d6"

typography:
  wordmark:
    fontFamily: "InstrumentSerif_400Regular (+ _Italic for 'Asia')"
    fontSize: 40px (screens) / 60px (intro hero)
  large-title:
    fontFamily: "InstrumentSerif_400Regular"
    fontSize: 40px
    lineHeight: 44px
  title:
    fontFamily: "InstrumentSerif_400Regular"
    fontSize: 28px
    lineHeight: 32px
  subtitle:
    fontFamily: "WorkSans_400Regular"
    fontSize: 15px
    lineHeight: 21px
  body:
    fontFamily: "WorkSans_400Regular"
    fontSize: 16px
    lineHeight: 22px
  button:
    fontFamily: "WorkSans_600SemiBold"
    fontSize: 15px
  caption:
    fontFamily: "IBMPlexMono_600SemiBold"
    fontSize: 11px
    letterSpacing: 1.5px
    textTransform: uppercase

rounded:
  card: 14px

spacing:
  screen-h: 20px
  row-v: 15px
  row-h: 16px

components:
  wordmark:
    text: "Epic *Asia*"
    italicColor: "{colors.highlight}"
    seal: "{components.seal}"
  seal:
    fill: "{colors.accent}"
    glyph: "旅, {colors.on-accent}"
    rotation: -4deg
    size: 0.68 × wordmark size
  header-glow:
    red: "{colors.accent} @ 24%, radial from top-left"
    gold: "{colors.highlight} @ 10%, radial from top-right"
  grouped-card:
    backgroundColor: "{colors.card}"
    borderColor: "{colors.border}"
    rounded: "{rounded.card}"
  list-row:
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    iconColor: "{colors.highlight}"
    chevronColor: "{colors.ink-tertiary}"
    separatorColor: "{colors.separator}"
  primary-button:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.on-accent}"
  text-button:
    textColor: "{colors.highlight}"
  eyebrow-label:
    textColor: "{colors.highlight}"
    typography: "{typography.caption}"
---

## Overview

Epic Asia is **fixed dark** — `useTheme()` always returns `darkColors`
(`app.json` `userInterfaceStyle: "dark"`). The palette is the navy of the
user's "Asia Disney Adventure" trip-plan artifact with East Asian red & gold
accents ("B+", chosen from an A/B comparison). Earlier directions — lacquer
red/jade "travel journal", charcoal + brass, navy + amber — were each
rejected; see `CLAUDE.md` → Design direction for why.

**Key characteristics:**
- Navy surfaces; cards one step lighter with a **gold hairline** border.
- **Two accent roles, never swapped:** vermilion (`accent`) for filled
  shapes; antique gold (`highlight`) for text, icons and lines. Vermilion as
  small text on navy is illegible-looking — don't.
- One jewel tone per trip leg (`leg-*`) for itinerary days and landmarks.
- Instrument Serif for display only; Work Sans for UI; IBM Plex Mono for
  eyebrows/labels.
- A single brand lockup (`Wordmark` + `Seal`) and a soft `HeaderGlow` at
  the top of every top-level screen.

## Colors

- **Background** `#0a1d38` / **Card** `#123059` / **Card raised** `#173a6b`.
- **Border** gold at 32% — cards and inputs. **Separator** white 8% — rows
  inside a card (keeps lists from becoming a gold grid).
- **Ink** `#f3f6fa`, **secondary** `#a8bedd`, **tertiary** `#6f89ac`.
- **Accent** vermilion `#c8372d` (pressed `#a52b22`): primary buttons, seal,
  hero rule, REC dot, header glow.
- **Highlight** antique gold `#d6a85c`: eyebrows, italic "Asia", icons,
  text buttons, dial ticks and crosshair.
- **On accent** ivory `#fbf3e6`.
- **Legs:** Tokyo `#c9577a`, Kyoto/Nara `#d9a15b`, Beijing `#4f8fe0`,
  Shanghai `#6fae8f`, Hong Kong `#7b83d6` — via `legColorForCity()` (for
  "Kyoto → Beijing" transit days, the last-named city wins).

## Components

**Wordmark** (`src/components/Wordmark.tsx`) — "Epic *Asia*" + seal in a
row. The only way to render the brand name. It's a View, so never nest it in
`<Text>`.

**Seal** (`src/components/Seal.tsx`) — vermilion rounded-square hanko with
an ivory inner frame and 旅 ("journey"), rotated −4°. The glyph is an
embedded SVG path (from Noto Serif JP 900), so no CJK font ships.

**HeaderGlow** (`src/components/HeaderGlow.tsx`) — absolute, touch-
transparent radial wash; first child of a screen root.

**Grouped card / list row** — rounded 14px, gold hairline, gold outline
icons, neutral separators, tertiary chevrons.

**Form** (`src/components/form/`) — `FormScreen` (glow + title node or
string + subtitle + error + footer), `FormField` (mono caps label, card-
colored input with gold hairline), `FormButton` (primary vermilion / text
gold).

**Itinerary day** — mono caps date in the leg color with a leading dot;
item cards carry a 3px left border in the leg color.

## Launch Sequence

`src/components/LaunchSequence.tsx` — every cold open, tap to skip,
reduce-motion goes straight to the hero. A "360° camera" orbit: 8 line-art
landmark badges (`src/components/Landmarks.tsx`) ride an ellipse around a
dashed dial with gold ticks, HUD corners, a "360° SWEEP" REC readout and a
bearing/name/city readout; one full eased turn, then the rig scales to 1.9×
and dissolves into the hero (dates eyebrow, 60px Wordmark, vermilion rule,
airport route, trip stats). Only View transforms/opacity animate (native
driver). Don't animate SVG props.

## Do's and Don'ts

### Do
- Keep vermilion for fills and gold for lines/text.
- Use `Wordmark` for the brand name and `HeaderGlow` on top-level screens.
- Use leg colors only to identify cities.

### Don't
- Don't add more reds/golds or new accent tokens — one seal, one glow per
  screen is the ceiling. More reads as themed, not premium.
- Don't add cartoon motifs (lanterns, dragons, brush-stroke fonts).
- Don't add drop shadows; depth comes from the card/background step and
  hairlines.
- Don't reintroduce light-mode adaptation without being asked.

## Known Gaps

Documents only what's built: auth screens, home, itinerary list/add, and
the launch sequence. Extend as Flights, Lodging, Chat, etc. are built,
following these conventions.
