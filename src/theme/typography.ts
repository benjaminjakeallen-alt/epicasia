// Same three-family system as the trip-plan artifact:
// - Instrument Serif (400, plus italic for accent words) for display type
// - Work Sans for body/UI copy
// - IBM Plex Mono for eyebrows, labels, and anything "boarding pass"
// Custom fonts don't synthesize bold on iOS, so each weight is its own
// family name — use the matching entry below, never `fontWeight`.
export const fontFamily = {
  display: 'InstrumentSerif_400Regular',
  displayItalic: 'InstrumentSerif_400Regular_Italic',
  body: 'WorkSans_400Regular',
  bodyMedium: 'WorkSans_500Medium',
  bodySemiBold: 'WorkSans_600SemiBold',
  mono: 'IBMPlexMono_500Medium',
  monoSemiBold: 'IBMPlexMono_600SemiBold',
};

export const type = {
  wordmark: { fontFamily: fontFamily.display, fontSize: 52, lineHeight: 56, letterSpacing: -0.5 },
  largeTitle: { fontFamily: fontFamily.display, fontSize: 40, lineHeight: 44, letterSpacing: -0.4 },
  title: { fontFamily: fontFamily.display, fontSize: 28, lineHeight: 32 },
  subtitle: { fontFamily: fontFamily.body, fontSize: 15, lineHeight: 21 },
  body: { fontFamily: fontFamily.body, fontSize: 16, lineHeight: 22 },
  bodyStrong: { fontFamily: fontFamily.bodyMedium, fontSize: 16, lineHeight: 22 },
  button: { fontFamily: fontFamily.bodySemiBold, fontSize: 15, lineHeight: 20 },
  caption: { fontFamily: fontFamily.monoSemiBold, fontSize: 11, lineHeight: 14, letterSpacing: 1.5 },
  mono: { fontFamily: fontFamily.mono, fontSize: 12, lineHeight: 16, letterSpacing: 0.4 },
};
