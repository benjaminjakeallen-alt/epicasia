import { colors } from './colors';

// Epic Asia has one signature look — the light "natural" palette — rather
// than following the system light/dark setting (app.json pins
// userInterfaceStyle to "light"). Kept as a hook so a theme toggle could
// slot in later without touching every screen.
export function useTheme() {
  return colors;
}
