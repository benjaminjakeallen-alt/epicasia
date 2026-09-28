import Svg, { G, Path, Rect } from 'react-native-svg';
import { useTheme } from '../theme/useTheme';

// 旅 ("journey / travel" — same character and meaning in Japanese and
// Chinese), as a vector outline rather than live text: it renders
// identically on every device with no CJK font dependency. Outline
// extracted once from Noto Serif JP 900 (SIL OFL) via fontTools and
// normalized to a 0–100 box.
const GLYPH =
  'M51.7 46.9 65.2 41.5V94.3Q65.2 94.9 62.3 96.2Q59.3 97.6 54.2 97.6H51.7ZM70.2 39.4Q72 49.9 75.9 58.5Q79.8 67 85.6 73Q91.3 79 98.4 82L98.2 83.1Q94.3 84.4 91.3 88.1Q88.3 91.8 86.9 97.7Q80.7 91.8 77.1 84Q73.6 76.2 71.8 65.3Q70 54.5 69.1 39.7ZM71.1 22.9 86.4 32.3Q85.6 33.6 82.9 33Q78.6 36.8 71.7 40.8Q64.9 44.7 56.8 47.9Q48.7 51.2 40.8 52.9L40.2 51.7Q46.3 48.2 52.4 43.3Q58.4 38.3 63.4 32.9Q68.3 27.4 71.1 22.9ZM55.4 20.1H78.7L85.7 10.5Q85.7 10.5 86.9 11.6Q88.2 12.6 90.2 14.3Q92.1 15.9 94.2 17.8Q96.4 19.7 98.1 21.3Q97.7 22.9 95.2 22.9H55.4ZM54.7 2.3 73.6 8.7Q73.3 9.7 72.2 10.2Q71.1 10.8 69.4 10.7Q64.2 20.9 57.1 27.7Q50.1 34.6 41.6 39L40.6 38.1Q43.6 33.8 46.3 28.1Q49 22.4 51.3 15.8Q53.5 9.2 54.7 2.3ZM85.8 38.4 100 48.7Q99.5 49.4 98.4 49.7Q97.4 50.1 95.9 49.4Q93.6 51 90 53Q86.3 55.1 82 57.2Q77.7 59.2 73.6 60.8L73 60.2Q75.3 57 77.8 52.9Q80.3 48.8 82.5 44.9Q84.7 41 85.8 38.4ZM16.2 2.4 34.1 3.8Q34 4.7 33.4 5.4Q32.7 6.1 30.9 6.4V24.1H16.2ZM1.3 23H31.8L38.7 12.9Q38.7 12.9 40 14Q41.3 15.1 43.2 16.9Q45.2 18.7 47.3 20.6Q49.4 22.5 51.2 24.2Q50.8 25.8 48.3 25.8H2.1ZM30.4 39.2H29.3L36 32.5L47.5 42.3Q46.9 43 46 43.5Q45 44 43.3 44.2Q43 56.6 42.5 65Q42.1 73.4 41.3 78.7Q40.5 84.1 39.2 87.1Q37.8 90.2 35.8 91.9Q33.3 94.1 30.1 95.2Q26.8 96.3 22.7 96.3Q22.7 93.1 22.4 90.9Q22.1 88.6 21.2 87.3Q20.2 85.9 18.5 84.9Q16.8 83.9 14.1 83.1V81.9Q15.5 82 17.3 82.1Q19 82.2 20.5 82.3Q22.1 82.3 23 82.3Q24.1 82.3 24.8 82.1Q25.5 81.8 26 81.3Q27.4 80 28.3 75.4Q29.1 70.7 29.6 61.9Q30.1 53 30.4 39.2ZM19.2 39.2H35.8V42H19.2ZM12.1 24.2H25.9Q25.8 34.8 25.1 45Q24.4 55.1 22.1 64.4Q19.9 73.8 14.9 82.1Q10 90.4 1.2 97.4L0 96.1Q4.8 87.9 7.4 79.2Q9.9 70.5 10.9 61.5Q11.9 52.4 12 43Q12.1 33.7 12.1 24.2Z';

// Hanko-style seal: vermilion stamp, ivory "paper" showing through the
// character, thin inner frame, a few degrees of hand-stamped tilt.
export default function Seal({ size }: { size: number }) {
  const colors = useTheme();
  return (
    <Svg width={size} height={size} viewBox="0 0 120 120" style={{ transform: [{ rotate: '-4deg' }] }}>
      <Rect x={2} y={2} width={116} height={116} rx={12} fill={colors.accent} />
      <Rect x={9} y={9} width={102} height={102} rx={7} fill="none" stroke={colors.onAccent} strokeWidth={2.5} />
      <G transform="translate(19 19) scale(0.82)">
        <Path d={GLYPH} fill={colors.onAccent} />
      </G>
    </Svg>
  );
}
