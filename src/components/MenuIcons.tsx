import { Circle, G, Path } from 'react-native-svg';
import { Frame, type LandmarkProps } from './Landmarks';

// Line-art menu icons for the home orbit, on the same 64x64 grid and stroke
// weight as the landmarks (Landmarks.tsx) so both rings read as one set.

// Folded map with a dotted route and a destination pin.
export function ItineraryIcon(p: LandmarkProps) {
  return (
    <Frame {...p}>
      <Path d="M6 18 L22 12 L40 18 L58 12 V48 L40 54 L22 48 L6 54 Z" />
      <Path d="M22 12 V48 M40 18 V54" />
      <Path d="M12 45 Q20 36 28 40 T44 33" strokeDasharray="1.5 4.5" />
      <Path d="M47 33 C47 33 40.5 26 40.5 21.5 A6.5 6.5 0 0 1 53.5 21.5 C53.5 26 47 33 47 33 Z" />
      <Circle cx={47} cy={21.5} r={2.2} />
    </Frame>
  );
}

// Airliner seen from above, banked toward the next leg.
export function FlightsIcon(p: LandmarkProps) {
  return (
    <Frame {...p}>
      <G transform="rotate(40 32 32)">
        <Path d="M32 6 C35 6 36 10 36 14 V26 L58 38 V43 L36 36 V50 L43 55 V59 L32 56 L21 59 V55 L28 50 V36 L6 43 V38 L28 26 V14 C28 10 29 6 32 6 Z" />
      </G>
    </Frame>
  );
}

// Bed under a crescent moon.
export function LodgingIcon(p: LandmarkProps) {
  return (
    <Frame {...p}>
      <Path d="M44 7 A9 9 0 1 0 55 19 A7 7 0 0 1 44 7 Z" />
      <Path d="M6 54 V26 M6 40 H58 V54 M6 47 H58" />
      <Path d="M22 40 V35 Q22 32 25 32 H53 Q58 32 58 37 V40" />
      <Path d="M10 40 V36 Q10 32 14 32 H16 Q19 32 19 36 V40" />
    </Frame>
  );
}

// Roller suitcase with a luggage tag.
export function PackingIcon(p: LandmarkProps) {
  return (
    <Frame {...p}>
      <Path d="M26 17 V10 Q26 8 28 8 H36 Q38 8 38 10 V17" />
      <Path d="M18 17 H46 Q50 17 50 21 V49 Q50 53 46 53 H18 Q14 53 14 49 V21 Q14 17 18 17 Z" />
      <Path d="M24 22 V48 M40 22 V48" />
      <Circle cx={20} cy={57} r={2.5} />
      <Circle cx={44} cy={57} r={2.5} />
      <Path d="M50 25 L55 27 L58 33 L54 36 L49 34" />
    </Frame>
  );
}

// Bound notebook with ruled lines and a ribbon marker.
export function JournalIcon(p: LandmarkProps) {
  return (
    <Frame {...p}>
      <Path d="M14 6 H46 Q51 6 51 11 V51 Q51 56 46 56 H14 Z" />
      <Path d="M20 6 V56" />
      <Path d="M27 18 H44 M27 25 H44 M27 32 H38" />
      <Path d="M40 56 V62 L37.5 59.5 L35 62 V56" />
    </Frame>
  );
}

// Game controller.
export function GamesIcon(p: LandmarkProps) {
  return (
    <Frame {...p}>
      <Path d="M20 20 H44 C52 20 57 27 58 37 C59 47 55 53 49 53 C44 53 42 47 38 44 H26 C22 47 20 53 15 53 C9 53 5 47 6 37 C7 27 12 20 20 20 Z" />
      <Path d="M18 31 V41 M13 36 H23" />
      <Circle cx={43} cy={32} r={2.2} />
      <Circle cx={49} cy={38} r={2.2} />
    </Frame>
  );
}
