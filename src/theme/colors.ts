// "Natural" palette — light and airy, like morning mist over a garden: warm
// paper background, white cards with soft shadows, a sage/forest green as
// the one action color, and a single vermilion reserved for the 旅 seal.
// Supersedes the navy + vermilion/gold "B+" direction (see CLAUDE.md →
// Design direction for the history).
export const colors = {
  background: '#f3f1ea',
  groupedBackground: '#f3f1ea',
  card: '#ffffff',
  cardRaised: '#faf9f5',
  // Card/input edges and row separators — ink at low alpha so they read as
  // soft edges, not drawn lines.
  border: 'rgba(30,39,33,0.09)',
  separator: 'rgba(30,39,33,0.07)',

  ink: '#1e2721',
  inkSecondary: '#56635a',
  inkTertiary: '#8f9a92',

  // `accent` is for FILLS (primary buttons, day circles, selected states);
  // `highlight` is for TEXT AND LINES (italic "Asia", links, icons). Same
  // green today — kept as two tokens so they can diverge again.
  accent: '#4f7a5c',
  accentPressed: '#3e6349',
  accentSoft: 'rgba(79,122,92,0.12)',
  highlight: '#4f7a5c',

  onAccent: '#ffffff',

  // The hanko seal next to the wordmark (and the intro's REC dot) — the
  // only red in the app.
  seal: '#c8452f',

  // Soft gold for the home orbit's glowing connector line only.
  gold: '#d4a64a',
  goldLight: '#ffe2a3',

  // Top of the sky backdrop; fades down into `background`.
  sky: '#dde7ea',

  error: '#b4533e',
};

// Soft, diffuse elevation for cards and floating buttons. `boxShadow` is
// supported on iOS, Android and web in this React Native version.
export const shadow = {
  card: '0px 6px 20px rgba(30,39,33,0.07)',
  float: '0px 10px 28px rgba(30,39,33,0.13)',
};

// One color per leg, in trip order — kept stable so a city always reads as
// the same color everywhere (itinerary dots, landmark and menu badges).
// Deepened from the original artifact hues so they hold up on white.
export const legColors = {
  tokyo: '#c0667d',
  kyoto: '#b7893f',
  beijing: '#4c7db0',
  shanghai: '#3f8a6e',
  hongKong: '#6c70b0',
};

const CITY_LEGS: [string, string][] = [
  ['tokyo', legColors.tokyo],
  ['kyoto', legColors.kyoto],
  ['nara', legColors.kyoto],
  ['beijing', legColors.beijing],
  ['shanghai', legColors.shanghai],
  ['hong kong', legColors.hongKong],
];

// Free-text city -> leg color. For transit days like "Kyoto → Beijing",
// the last-mentioned city wins, since that's where the day ends up.
export function legColorForCity(city: string | null | undefined): string | null {
  if (!city) return null;
  const lower = city.toLowerCase();
  let best: { at: number; color: string } | null = null;
  for (const [name, color] of CITY_LEGS) {
    const at = lower.lastIndexOf(name);
    if (at !== -1 && (!best || at > best.at)) best = { at, color };
  }
  return best?.color ?? null;
}

export type ThemeColors = typeof colors;
