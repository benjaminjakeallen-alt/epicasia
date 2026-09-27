import { darkColors } from './colors';

// Epic Asia has one signature look — fixed dark/brass luxury — rather than
// adapting to the system's light/dark setting, the way most premium travel
// and hospitality apps commit to a single brand appearance. `lightColors`
// in ./colors is kept in reserve (e.g. a future user-facing theme toggle)
// but isn't wired to the OS setting.
export function useTheme() {
  return darkColors;
}
