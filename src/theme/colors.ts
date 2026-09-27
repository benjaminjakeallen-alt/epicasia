// Minimal luxury: charcoal/near-black surfaces, brass/gold as the only
// accent, warm off-white ink instead of pure white. No thematic color
// motifs — "Epic Asia" is a wordmark and a launch sequence, not a palette.
export const darkColors = {
  background: '#0B0B0C',
  groupedBackground: '#0B0B0C',
  card: '#17171A',
  border: '#28282C',
  separator: '#232326',

  ink: '#F2EFE9',
  inkSecondary: '#A7A29A',
  inkTertiary: '#6C6862',

  accent: '#C9A24B',
  accentPressed: '#AD8A3E',

  onAccent: '#171208',
};

export const lightColors = {
  background: '#FAF8F4',
  groupedBackground: '#F3F0E9',
  card: '#FFFFFF',
  border: '#E4E0D5',
  separator: '#EAE6DB',

  ink: '#1B1A17',
  inkSecondary: '#615C51',
  inkTertiary: '#9C968A',

  accent: '#A9822F',
  accentPressed: '#8E6E28',

  onAccent: '#FFFCF5',
};

export type ThemeColors = typeof darkColors;
