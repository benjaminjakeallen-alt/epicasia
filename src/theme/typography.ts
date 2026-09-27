// Display type uses Fraunces (a warm, editorial serif) for trip titles and
// section headers — the one deliberate departure from the system font,
// meant to read as "travel journal / hospitality brand" rather than a
// generic app. Body and UI copy stay on the system font (San Francisco on
// iOS) for native feel and performance.
export const fontFamily = {
  display: 'Fraunces_600SemiBold',
  displayItalic: 'Fraunces_500Medium_Italic',
};

export const type = {
  largeTitle: { fontFamily: fontFamily.display, fontSize: 34, lineHeight: 40 },
  title: { fontFamily: fontFamily.display, fontSize: 22, lineHeight: 28 },
  subtitle: { fontSize: 15, lineHeight: 20 },
  body: { fontSize: 17, lineHeight: 22 },
  caption: { fontSize: 13, lineHeight: 18 },
};
