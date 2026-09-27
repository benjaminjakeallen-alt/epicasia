// Palette direction: warm travel-journal paper + lacquer red, jade, and
// brushed gold accents. Reads as considered and editorial, not a generic
// iOS gray list and not a cartoonish "Asian-themed" pastiche — no dragons,
// no bamboo borders, just restrained color and materials.
export const lightColors = {
  background: '#F7F1E6',
  groupedBackground: '#F1E9DA',
  card: '#FFFDF8',
  border: '#E4D8C3',
  separator: '#EAE0CC',

  ink: '#211C16',
  inkSecondary: '#6B6153',
  inkTertiary: '#A69B89',

  lacquer: '#A3352A',
  lacquerPressed: '#832A21',
  jade: '#2F5D50',
  gold: '#B8892B',

  onLacquer: '#FBF3EC',
};

export const darkColors = {
  background: '#161310',
  groupedBackground: '#100D0B',
  card: '#211C17',
  border: '#3A322A',
  separator: '#332B24',

  ink: '#F3ECE0',
  inkSecondary: '#C2B7A5',
  inkTertiary: '#7D7364',

  lacquer: '#D1594A',
  lacquerPressed: '#B4483B',
  jade: '#4F9683',
  gold: '#D4AF6A',

  onLacquer: '#241210',
};

export type ThemeColors = typeof lightColors;
