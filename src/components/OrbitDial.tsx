import type { ReactElement } from 'react';
import { Ellipse, G, Line, Text as SvgText } from 'react-native-svg';
import { colors as c } from '../theme/colors';
import { fontFamily } from '../theme/typography';

// Static perspective "turntable" the landmarks ride on: the orbit ellipse
// plus a compass-style tick ring with bearing labels, like a 360° rig.
export default function OrbitDial({ cx, cy, rx, ry }: { cx: number; cy: number; rx: number; ry: number }) {
  const ticks: ReactElement[] = [];
  for (let deg = 0; deg < 360; deg += 5) {
    const a = (deg * Math.PI) / 180;
    const major = deg % 45 === 0;
    const r0 = major ? 1.1 : 1.16;
    const r1 = 1.22;
    ticks.push(
      <Line
        key={deg}
        x1={cx + rx * r0 * Math.sin(a)}
        y1={cy + ry * r0 * Math.cos(a)}
        x2={cx + rx * r1 * Math.sin(a)}
        y2={cy + ry * r1 * Math.cos(a)}
        stroke={major ? c.highlight : c.ink}
        strokeOpacity={major ? 0.7 : 0.14}
        strokeWidth={major ? 1.6 : 1}
      />,
    );
  }
  const labels = [0, 90, 180, 270].map((deg) => {
    const a = (deg * Math.PI) / 180;
    return (
      <SvgText
        key={deg}
        x={cx + rx * 1.36 * Math.sin(a)}
        y={cy + ry * 1.36 * Math.cos(a) + 4}
        fill={c.inkTertiary}
        fontSize={9}
        fontFamily={fontFamily.mono}
        letterSpacing={1}
        textAnchor="middle"
      >
        {String(deg).padStart(3, '0')}
      </SvgText>
    );
  });

  return (
    <G>
      <Ellipse
        cx={cx}
        cy={cy}
        rx={rx * 1.22}
        ry={ry * 1.22}
        fill="none"
        stroke={c.ink}
        strokeOpacity={0.08}
      />
      <Ellipse
        cx={cx}
        cy={cy}
        rx={rx}
        ry={ry}
        fill="none"
        stroke={c.ink}
        strokeOpacity={0.22}
        strokeDasharray="2 7"
        strokeLinecap="round"
      />
      {ticks}
      {labels}
      <Line x1={cx - 8} y1={cy} x2={cx + 8} y2={cy} stroke={c.highlight} strokeOpacity={0.6} />
      <Line x1={cx} y1={cy - 8} x2={cx} y2={cy + 8} stroke={c.highlight} strokeOpacity={0.6} />
    </G>
  );
}
