// - Newsreader (serif; 400 + italic for accent words, 500 for card titles)
//   for display type — soft, bookish, matches the "natural" direction.
// - Work Sans for body/UI copy.
// - IBM Plex Mono only for boarding-pass data (airport codes, flight
//   numbers, the intro's HUD) — not for general labels.
// Custom fonts don't synthesize bold on iOS, so each weight is its own
// family name — use the matching entry below, never `fontWeight`.
export const fontFamily = {
  display: 'Newsreader_400Regular',
  displayItalic: 'Newsreader_400Regular_Italic',
  displayMedium: 'Newsreader_500Medium',
  body: 'WorkSans_400Regular',
  bodyMedium: 'WorkSans_500Medium',
  bodySemiBold: 'WorkSans_600SemiBold',
  mono: 'IBMPlexMono_500Medium',
  monoSemiBold: 'IBMPlexMono_600SemiBold',
};

export const type = {
  wordmark: { fontFamily: fontFamily.display, fontSize: 52, lineHeight: 58, letterSpacing: -0.8 },
  largeTitle: { fontFamily: fontFamily.display, fontSize: 38, lineHeight: 44, letterSpacing: -0.6 },
  title: { fontFamily: fontFamily.display, fontSize: 26, lineHeight: 32, letterSpacing: -0.3 },
  cardTitle: { fontFamily: fontFamily.bodySemiBold, fontSize: 16, lineHeight: 22 },
  subtitle: { fontFamily: fontFamily.body, fontSize: 15, lineHeight: 22 },
  body: { fontFamily: fontFamily.body, fontSize: 15, lineHeight: 22 },
  bodyStrong: { fontFamily: fontFamily.bodyMedium, fontSize: 15, lineHeight: 22 },
  button: { fontFamily: fontFamily.bodySemiBold, fontSize: 16, lineHeight: 20 },
  caption: { fontFamily: fontFamily.bodyMedium, fontSize: 12.5, lineHeight: 16, letterSpacing: 0.2 },
  mono: { fontFamily: fontFamily.mono, fontSize: 12, lineHeight: 16, letterSpacing: 0.4 },
};
