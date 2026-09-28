// Navy surfaces from the "Asia Disney Adventure" trip-plan artifact
// (https://claude.ai/artifact/Cpu7mN9wmq6c3LbjQh1NcT), pushed toward an East
// Asian lacquer feel: vermilion for fills, antique gold for text/lines and
// card hairlines, and one jewel tone per leg of the trip.
export const darkColors = {
  background: '#0a1d38',
  groupedBackground: '#0a1d38',
  card: '#123059',
  cardRaised: '#173a6b',
  // Gold hairline on cards/inputs; row separators inside a card stay a
  // neutral soft white so a list doesn't turn into a gold grid.
  border: 'rgba(214,168,92,0.32)',
  separator: 'rgba(255,255,255,0.08)',

  ink: '#f3f6fa',
  inkSecondary: '#a8bedd',
  inkTertiary: '#6f89ac',

  // `accent` is for FILLS (primary buttons, the REC dot, the hero rule,
  // background glow). `highlight` is for TEXT AND LINES (eyebrows, the
  // italic "Asia", icons, dial ticks, text links). They're split because
  // some accent colors (e.g. vermilion) read well as a filled shape but
  // poorly as small text on navy.
  accent: '#c8372d',
  accentPressed: '#a52b22',
  highlight: '#d6a85c',
  glowSecondary: '#d6a85c',

  // Warm ivory on vermilion — button labels and the seal's glyph.
  onAccent: '#fbf3e6',

  error: '#ef6b6b',
};

// One color per leg, in trip order. Same assignments as the artifact's
// route line and leg cards — keep them stable so a city always reads as
// the same color everywhere in the app.
export const legColors = {
  tokyo: '#c9577a',
  kyoto: '#d9a15b',
  beijing: '#4f8fe0',
  shanghai: '#6fae8f',
  hongKong: '#7b83d6',
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

// Reserved, unused: the app is fixed-dark (see useTheme.ts).
export const lightColors = {
  background: '#f3f6fa',
  groupedBackground: '#e8eef6',
  card: '#ffffff',
  cardRaised: '#f7f9fc',
  border: 'rgba(10,29,56,0.14)',
  separator: 'rgba(10,29,56,0.08)',

  ink: '#0a1d38',
  inkSecondary: '#3d5578',
  inkTertiary: '#6f89ac',

  accent: '#c85a26',
  accentPressed: '#a4481d',
  highlight: '#c85a26',
  glowSecondary: '#7b83d6',

  onAccent: '#ffffff',

  error: '#c64545',
};

export type ThemeColors = typeof darkColors;
