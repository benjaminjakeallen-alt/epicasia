import type { ReactNode } from 'react';
import Svg, { Circle, G, Path } from 'react-native-svg';
import { legColors } from '../theme/colors';

// Line-art landmarks from the actual trip plan, drawn on a shared 64x64
// grid so they sit at a consistent visual weight when arranged together.
export type LandmarkProps = { color: string; size: number };

export function Frame({ color, size, children }: LandmarkProps & { children: ReactNode }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 64 64" fill="none">
      <G stroke={color} strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round">
        {children}
      </G>
    </Svg>
  );
}

function Todaiji(p: LandmarkProps) {
  return (
    <Frame {...p}>
      <Path d="M16 16 H48 M16 16 Q13 11 17 9 M48 16 Q51 11 47 9" />
      <Path d="M16 16 L4 30 H60 L48 16" />
      <Path d="M26 30 Q32 23 38 30" />
      <Path d="M10 34 L4 40 H60 L54 34 Z" />
      <Path d="M10 40 V52 M54 40 V52 M18 42 V52 M46 42 V52 M29 52 V44 H35 V52" />
      <Path d="M4 52 H60 M2 56 H62" />
    </Frame>
  );
}

function DisneyCastle(p: LandmarkProps) {
  return (
    <Frame {...p}>
      <Path d="M14 58 V38 H22 V58 M42 58 V38 H50 V58 M24 58 V30 H40 V58" />
      <Path d="M13 38 L18 27 L23 38 M41 38 L46 27 L51 38 M23 30 L32 12 L41 30" />
      <Path d="M32 12 V5 L37 7 L32 9" />
      <Path d="M29 58 V51 A3 3 0 0 1 35 51 V58" />
      <Path d="M9 58 H55" />
    </Frame>
  );
}

function Kinkakuji(p: LandmarkProps) {
  return (
    <Frame {...p}>
      <Path d="M32 5 V12" />
      <Path d="M12 20 Q32 11 52 20 M18 20 V28 M46 20 V28" />
      <Path d="M8 30 Q32 22 56 30 M14 30 V40 M50 30 V40" />
      <Path d="M22 33 V38 M28 33 V38 M36 33 V38 M42 33 V38" />
      <Path d="M10 42 H54 M14 42 V50 M50 42 V50 M10 50 H54" />
      <Path d="M6 56 H58 M14 61 H50" strokeDasharray="3 4" />
    </Frame>
  );
}

function Torii(p: LandmarkProps) {
  return (
    <Frame {...p}>
      <Path d="M5 12 Q32 20 59 12 M9 17 Q32 22 55 17" />
      <Path d="M12 28 H52 M32 20 V28" />
      <Path d="M19 18 L17 58 M45 18 L47 58" />
      <Path d="M13 58 H22 M42 58 H51" />
    </Frame>
  );
}

function GreatWall(p: LandmarkProps) {
  return (
    <Frame {...p}>
      <Path d="M4 38 L14 26 L22 32 L34 18 L46 26 L60 14" strokeOpacity={0.45} />
      <Path d="M4 48 L16 40 L28 44 L40 32 L52 36 L60 30" />
      <Path d="M4 56 L16 48 L28 52 L40 40 L52 44 L60 38" />
      <Path d="M35 33 V22 H45 V35 M35 22 V19 H38 V22 M42 22 V19 H45 V22 M39 28 H41" />
      <Path d="M12 42 V34 H20 V42 M12 34 V31 H15 V34 M17 34 V31 H20 V34" />
    </Frame>
  );
}

function TempleOfHeaven(p: LandmarkProps) {
  return (
    <Frame {...p}>
      <Circle cx={32} cy={6} r={2} />
      <Path d="M32 8 V11 M20 20 Q32 10 44 20 H20 M22 20 V24 M42 20 V24" />
      <Path d="M15 28 Q32 18 49 28 H15 M18 28 V32 M46 28 V32" />
      <Path d="M10 36 Q32 25 54 36 H10 M14 36 V45 M50 36 V45" />
      <Path d="M21 39 V45 M27 39 V45 M32 39 V45 M37 39 V45 M43 39 V45" />
      <Path d="M8 46 H56 M5 51 H59 M2 56 H62" />
    </Frame>
  );
}

function PearlTower(p: LandmarkProps) {
  return (
    <Frame {...p}>
      <Path d="M32 2 V9" />
      <Circle cx={32} cy={12} r={2.6} />
      <Path d="M30.5 14.5 V20 M33.5 14.5 V20" />
      <Circle cx={32} cy={26} r={6} />
      <Path d="M29 32 V38 M35 32 V38" />
      <Circle cx={32} cy={46} r={8} />
      <Path d="M26 52 L18 62 M38 52 L46 62 M32 54 V62 M12 62 H52" />
    </Frame>
  );
}

function BigBuddha(p: LandmarkProps) {
  return (
    <Frame {...p}>
      <Circle cx={32} cy={14} r={5} />
      <Path d="M30 9 Q32 6 34 9" />
      <Path d="M22 27 Q32 20 42 27 M22 27 Q18 37 20 44 M42 27 Q46 37 44 44" />
      <Path d="M40 34 L44 27" />
      <Path d="M26 40 Q32 44 38 40" />
      <Path d="M14 48 Q32 40 50 48 Q32 55 14 48" />
      <Path d="M16 55 Q20 49 24 55 Q28 49 32 55 Q36 49 40 55 Q44 49 48 55 M10 58 H54" />
    </Frame>
  );
}

// Every entry is a stop in the actual trip plan, in trip order around the
// orbit so the ring reads as the route itself. Don't add famous-but-not-
// on-the-itinerary landmarks (Tokyo Tower, Fushimi Inari) — the point is
// "places we're going."
export const LANDMARKS = [
  { name: 'Tokyo Disney', city: 'Tokyo', color: legColors.tokyo, Icon: DisneyCastle },
  { name: 'Meiji Shrine', city: 'Tokyo', color: legColors.tokyo, Icon: Torii },
  { name: 'Kinkaku-ji', city: 'Kyoto', color: legColors.kyoto, Icon: Kinkakuji },
  { name: 'Todai-ji', city: 'Nara', color: legColors.kyoto, Icon: Todaiji },
  { name: 'Great Wall', city: 'Beijing', color: legColors.beijing, Icon: GreatWall },
  { name: 'Temple of Heaven', city: 'Beijing', color: legColors.beijing, Icon: TempleOfHeaven },
  { name: 'Pearl Tower', city: 'Shanghai', color: legColors.shanghai, Icon: PearlTower },
  { name: 'Big Buddha', city: 'Hong Kong', color: legColors.hongKong, Icon: BigBuddha },
];
