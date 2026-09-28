// Palette lifted directly from the "Asia Disney Adventure" trip-plan
// artifact (https://claude.ai/artifact/Cpu7mN9wmq6c3LbjQh1NcT) so the app
// and the plan read as one brand: deep navy "night flight" surfaces, amber
// as the primary accent, and one jewel tone per leg of the trip.
export const darkColors = {
  background: '#0a1d38',
  groupedBackground: '#0a1d38',
  card: '#123059',
  cardRaised: '#173a6b',
  border: 'rgba(255,255,255,0.16)',
  separator: 'rgba(255,255,255,0.09)',

  ink: '#f3f6fa',
  inkSecondary: '#a8bedd',
  inkTertiary: '#6f89ac',

  accent: '#e2703a',
  accentPressed: '#b8582a',

  // Dark navy on amber, same as the artifact's selected-tab treatment.
  onAccent: '#0a1d38',

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

  onAccent: '#ffffff',

  error: '#c64545',
};

export type ThemeColors = typeof darkColors;
