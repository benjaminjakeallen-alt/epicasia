// Semantic color tokens — the ONLY place raw color values live. Components
// ask for a role ("secondary text", "danger", "control on a photo"), never
// for a hex value, so the palette can change in one place and every pair
// below stays checked for contrast.
//
// "Natural" palette — light and airy, like morning mist over a garden: warm
// paper background, white cards with soft shadows, a sage/forest green as
// the one action color, and a single vermilion reserved for the 旅 seal.
// (History of earlier palettes: CLAUDE.md → Design direction.)
//
// Contrast (WCAG 2.2 AA, checked against both `background` #f3f1ea and
// `card` #ffffff; ratios are on the paper background, the lower of the two):
//   ink 13.6 · inkSecondary 5.6 · inkTertiary 4.6 · accent/highlight 4.9 ·
//   danger 4.8 · success 4.5 · warning 4.7 · info 4.7 — all ≥ 4.5 for text.
//   White on accent 5.5, on danger 5.5, on every person color ≥ 5.2.
//   legColors are FILLS (dots, rails, lines) and only need 3:1; text in a
//   leg's color must use legTextColors (all ≥ 4.6).
export const colors = {
  // ---- Surfaces ----
  background: '#f3f1ea',
  groupedBackground: '#f3f1ea',
  card: '#ffffff',
  cardRaised: '#faf9f5',
  /** Translucent paper for bars that float over scrolling content. */
  barBackground: 'rgba(243,241,234,0.97)',
  /** Pressed/hover tint on a card row. */
  surfacePressed: 'rgba(30,39,33,0.04)',
  /** Skeleton placeholders and not-yet-loaded images. */
  skeleton: 'rgba(30,39,33,0.08)',
  /** Dims the screen behind a sheet or popover. */
  scrim: 'rgba(30,39,33,0.28)',
  /** Drag handle on sheets. */
  handle: 'rgba(30,39,33,0.15)',

  // ---- Lines ----
  // Card/input edges and row separators — ink at low alpha so they read as
  // soft edges, not drawn lines.
  border: 'rgba(30,39,33,0.09)',
  separator: 'rgba(30,39,33,0.07)',

  // ---- Text ----
  ink: '#1e2721',
  inkSecondary: '#56635a',
  /** Timestamps, counts, placeholders — the faintest text that still passes AA. */
  inkTertiary: '#646f67',

  // ---- Action ----
  // `accent` is for FILLS (primary buttons, day circles, selected states);
  // `highlight` is for TEXT AND LINES (italic "Asia", links, icons). Same
  // green today — kept as two tokens so they can diverge again.
  accent: '#4a7256',
  accentPressed: '#3c5f47',
  accentSoft: 'rgba(74,114,86,0.12)',
  /** Disabled fill of an accent control (e.g. Send with nothing to send). */
  accentDisabled: 'rgba(74,114,86,0.28)',
  highlight: '#4a7256',
  onAccent: '#ffffff',

  // ---- Status ----
  success: '#3f7a52',
  successSoft: 'rgba(63,122,82,0.12)',
  warning: '#8a6420',
  warningSoft: 'rgba(138,100,32,0.12)',
  danger: '#a94e3a',
  dangerSoft: 'rgba(169,78,58,0.1)',
  onDanger: '#ffffff',
  info: '#446f9c',
  infoSoft: 'rgba(68,111,156,0.12)',
  /** Back-compat alias — prefer `danger`. */
  error: '#a94e3a',
  /** Favorite heart (an icon: 3:1 is enough). */
  favorite: '#c8433a',

  // ---- Brand ----
  // The hanko seal next to the wordmark — the only red in the chrome.
  seal: '#c8452f',
  // Game winners (Lost in Translation's daily winner): a gold frame
  // (decorative, the badge text carries the meaning), a pale gold badge
  // fill, and dark gold-brown text on it (6.8:1 on winnerSoft, 7.6 on white).
  winner: '#c39233',
  winnerSoft: '#fdf1d4',
  winnerInk: '#6e4e15',
  // Arcade games (Godzilla Rampage): the night behind the game while it
  // loads and around it on wide screens. The game's own pixel palette is
  // game art inside assets/games/rampage.html, not app chrome.
  arcade: '#0b0820',
  onArcade: '#ffffff', // 19.5:1
  // Soft gold for the home orbit's glowing connector line only.
  gold: '#d4a64a',
  goldLight: '#ffe2a3',
  // Top of the sky backdrop; fades down into `background`.
  sky: '#dde7ea',
  // Illustration colors: sky clouds, the intro planet's sunlight and halo.
  cloud: '#ffffff',
  sunlight: '#fff6dc',
  // Games hub stage: the soft shadow under the floating hero icon.
  stageShadow: 'rgba(30,39,33,0.09)',
  halo: 'rgba(255,255,255,0.55)',

  // ---- Chat bubbles ----
  bubbleMine: '#4a7256',
  onBubbleMine: '#ffffff',
  onBubbleMineSecondary: 'rgba(255,255,255,0.88)',
  /** Reply quote inside my bubble: darker than the bubble so white text keeps ≥ 6:1. */
  bubbleMineQuote: 'rgba(0,0,0,0.14)',
  bubbleMineQuoteBar: 'rgba(255,255,255,0.75)',
  bubbleTheirsQuote: 'rgba(30,39,33,0.05)',

  // ---- Media (dark photo viewers, badges on top of photos) ----
  mediaBackground: '#0d110e',
  onMedia: '#ffffff',
  /** Secondary text on the dark viewer (≥ 9:1). */
  onMediaSecondary: 'rgba(255,255,255,0.72)',
  onMediaTertiary: 'rgba(255,255,255,0.55)',
  /** Light sage for notes/tags on the dark viewer (14:1). */
  onMediaAccent: '#cfe3d4',
  mediaControl: 'rgba(255,255,255,0.16)',
  mediaControlPressed: 'rgba(255,255,255,0.26)',
  mediaField: 'rgba(255,255,255,0.1)',
  mediaBar: 'rgba(13,17,14,0.6)',
  mediaTag: 'rgba(74,114,86,0.45)',
  /** Small dark chip on top of a photo thumbnail (white icon on it). */
  mediaBadge: 'rgba(0,0,0,0.45)',
  mediaFavorite: '#ff8a8a',
  mediaFavoriteSoft: 'rgba(255,138,138,0.18)',
  mediaDanger: '#ffb4a6',
};

// Soft, diffuse elevation for cards and floating buttons. `boxShadow` is
// supported on iOS, Android and web in this React Native version.
export const shadow = {
  card: '0px 6px 20px rgba(30,39,33,0.07)',
  float: '0px 10px 28px rgba(30,39,33,0.13)',
  // sage glow around the Games hub's hero icon
  glow: '0px 0px 46px rgba(74,114,86,0.38)',
  // the soft blur around the Games hub's floor shadow
  stage: '0px 0px 12px 6px rgba(30,39,33,0.09)',
};

// One color per leg, in trip order — kept stable so a city always reads as
// the same color everywhere. FILLS: itinerary rails/day circles, dots, the
// route pips (≥ 3:1 on paper).
export const legColors = {
  tokyo: '#c0667d',
  kyoto: '#ac803b',
  beijing: '#4c7db0',
  shanghai: '#3f8a6e',
  hongKong: '#6c70b0',
};

// The same hues deepened for TEXT (≥ 4.6:1 on paper and card) — captions in
// a leg's color, menu labels, chat names.
export const legTextColors: typeof legColors = {
  tokyo: '#b24964',
  kyoto: '#88652f',
  beijing: '#446f9c',
  shanghai: '#377860',
  hongKong: '#6266ab',
};

// Avatar fills / per-traveler colors (white initials on each ≥ 5.2:1, and
// each also passes as text on paper).
export const personColors = [
  legTextColors.tokyo,
  legTextColors.beijing,
  legTextColors.kyoto,
  legTextColors.shanghai,
  legTextColors.hongKong,
  colors.accent,
  '#7a5c46',
  '#4f6f7c',
];

const CITY_LEGS: [string, keyof typeof legColors][] = [
  ['tokyo', 'tokyo'],
  ['kyoto', 'kyoto'],
  ['nara', 'kyoto'],
  ['beijing', 'beijing'],
  ['shanghai', 'shanghai'],
  ['hong kong', 'hongKong'],
];

function legForCity(city: string | null | undefined): keyof typeof legColors | null {
  if (!city) return null;
  const lower = city.toLowerCase();
  let best: { at: number; leg: keyof typeof legColors } | null = null;
  for (const [name, leg] of CITY_LEGS) {
    const at = lower.lastIndexOf(name);
    if (at !== -1 && (!best || at > best.at)) best = { at, leg };
  }
  return best?.leg ?? null;
}

// Free-text city -> leg color. For transit days like "Kyoto → Beijing",
// the last-mentioned city wins, since that's where the day ends up.
export function legColorForCity(city: string | null | undefined): string | null {
  const leg = legForCity(city);
  return leg ? legColors[leg] : null;
}

/** Like legColorForCity, but the text-safe shade. */
export function legTextForCity(city: string | null | undefined): string | null {
  const leg = legForCity(city);
  return leg ? legTextColors[leg] : null;
}

/** Text-safe shade for a leg fill color (falls back to the input). */
export function textShadeOf(fill: string): string {
  const leg = (Object.keys(legColors) as (keyof typeof legColors)[]).find((k) => legColors[k] === fill);
  return leg ? legTextColors[leg] : fill;
}

export type ThemeColors = typeof colors;
