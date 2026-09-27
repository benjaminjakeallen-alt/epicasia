// Playfair Display for the wordmark and section titles — the refined,
// high-contrast serif used across hospitality/luxury-travel branding.
// Everything else stays on the system font (San Francisco on iOS).
export const fontFamily = {
  display: 'PlayfairDisplay_600SemiBold',
  displayItalic: 'PlayfairDisplay_500Medium_Italic',
};

export const type = {
  wordmark: { fontFamily: fontFamily.display, fontSize: 40, lineHeight: 48 },
  largeTitle: { fontFamily: fontFamily.display, fontSize: 32, lineHeight: 38 },
  title: { fontFamily: fontFamily.display, fontSize: 22, lineHeight: 28 },
  subtitle: { fontSize: 15, lineHeight: 20, letterSpacing: 0.2 },
  body: { fontSize: 17, lineHeight: 22 },
  caption: { fontSize: 12, lineHeight: 16, letterSpacing: 1.2 },
};
