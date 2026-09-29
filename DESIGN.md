---
version: alpha
name: Epic-Asia
description: A light, natural group-trip app for Japan, China and Hong Kong — misty sky backdrops, white rounded cards with soft shadows, a sage-green primary, a Newsreader serif for headlines and real photos of the trip's places. One small vermilion 旅 seal is the only warm accent. Fixed light; does not follow the device's dark mode.

colors:
  background: "#f3f1ea"
  sky: "#dde7ea"
  card: "#ffffff"
  card-raised: "#faf9f5"
  border: "rgba(30,39,33,0.09)"
  separator: "rgba(30,39,33,0.07)"
  ink: "#1e2721"
  ink-secondary: "#56635a"
  ink-tertiary: "#8f9a92"
  accent: "#4f7a5c"
  accent-pressed: "#3e6349"
  accent-soft: "rgba(79,122,92,0.12)"
  highlight: "#4f7a5c"
  on-accent: "#ffffff"
  seal: "#c8452f"
  error: "#b4533e"
  leg-tokyo: "#c0667d"
  leg-kyoto: "#b7893f"
  leg-beijing: "#4c7db0"
  leg-shanghai: "#3f8a6e"
  leg-hong-kong: "#6c70b0"

shadow:
  card: "0 6px 20px rgba(30,39,33,0.07)"
  float: "0 10px 28px rgba(30,39,33,0.13)"

typography:
  headline:
    fontFamily: "Newsreader_400Regular (+ _Italic for the accent word)"
    fontSize: 38px
    lineHeight: 44px
  title:
    fontFamily: "Newsreader_400Regular"
    fontSize: 22–26px
  card-title:
    fontFamily: "WorkSans_600SemiBold"
    fontSize: 16px
  body:
    fontFamily: "WorkSans_400Regular"
    fontSize: 15px
    lineHeight: 22px
  caption:
    fontFamily: "WorkSans_500Medium"
    fontSize: 12.5px
  button:
    fontFamily: "WorkSans_600SemiBold"
    fontSize: 16px
  data:
    fontFamily: "IBMPlexMono_500Medium"
    use: "airport codes, flight numbers, intro HUD, dial bearings only"

rounded:
  card: 20–24px
  input: 16px
  button: 27px (54px-tall pill)
  circle-button: 22px (44px)
  photo-card: 22px

components:
  sky-backdrop: "SkyBackdrop.tsx — sky → paper gradient + soft clouds, first child of a screen"
  wordmark: "Epic *Asia* (italic, highlight) + seal"
  seal: "vermilion hanko, ivory 旅, rotated −4°"
  circle-button: "white 44px round button, shadow.card, Ionicons in ink"
  primary-button: "accent pill, white label, shadow.card"
  text-button: "highlight, WorkSans 500"
  input: "white, radius 16, sentence-case label above, shadow.card"
  place-card: "150×196 photo, radius 22, dark fade at bottom, white city/dates, round arrow"
  orbit-menu: "white badges with shadow; front badge gets a 2px ring in its color + float shadow; serif label under the ring; accent 'Open' pill or accent-soft 'Coming soon'"
  itinerary-day: "rail: weekday + leg-colored day circle + dashed connector; white card per item with photo thumb"
---

## Overview

Light, calm, "natural" — morning mist rather than night flight. Built from
two reference mockups the user chose: airy travel apps with sky
backgrounds, white cards floating on soft shadows, a green primary, serif
headlines and photo-led destination cards. Previous directions (lacquer
red/jade, charcoal + brass, navy + amber, navy + vermilion/gold) were all
dark; see `CLAUDE.md` → Design direction for the history.

**Key characteristics:**
- Paper background with a pale sky fading in at the top of each screen.
- White cards separated by soft shadow, not borders.
- One action color (sage green). One warm touch only: the vermilion seal.
- Real photographs of the trip's places carry the atmosphere; icons stay
  thin line art.
- Serif (Newsreader) for headlines and titles; Work Sans for everything
  else; mono only for boarding-pass data.

## Screens

- **Login / Register** — full-width photo header with rounded bottom
  corners (Kinkaku-ji / Great Wall), wordmark, subtitle, white inputs, green
  pill, "Keep me signed in for 30 days".
- **Home** — wordmark + avatar initial; "Where are we going, *Jake*?";
  trip meta; the swipeable 360° orbit menu on the sky; "Your route" photo
  cards for the five stops.
- **Itinerary** — round back / add buttons, "Your Itinerary", a trip
  summary card with photo and leg pips, then the day timeline.
- **Launch sequence** — the landmark orbit on a light sky, dissolving into
  the wordmark hero.

## Do's and Don'ts

### Do
- Put `SkyBackdrop` first on new top-level screens.
- Use `shadow.card` for elevation and white cards on the paper background.
- Use real photos for places; keep icons as thin line art.
- Keep leg colors stable per city.

### Don't
- Don't add more warm/red accents beyond the seal.
- Don't use tracked uppercase mono labels for general UI — sentence case
  Work Sans.
- Don't hard-border cards; don't use heavy/dark shadows.
- Don't reintroduce dark mode without being asked.
