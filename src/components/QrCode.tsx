// eslint-disable-next-line import/no-named-as-default -- the package's documented default export
import qrcode from 'qrcode-generator';
import { useMemo } from 'react';
import Svg, { Path, Rect } from 'react-native-svg';
import { colors as c } from '../theme/colors';

// A QR code drawn with react-native-svg (one path of dark modules on a
// white quiet zone), so it scans from a screen or a print-out.
export default function QrCode({ value, size, label }: { value: string; size: number; label: string }) {
  const { d, count } = useMemo(() => {
    const qr = qrcode(0, 'M');
    qr.addData(value);
    qr.make();
    const n = qr.getModuleCount();
    let path = '';
    for (let r = 0; r < n; r++) {
      for (let col = 0; col < n; col++) {
        if (qr.isDark(r, col)) path += `M${col} ${r}h1v1h-1z`;
      }
    }
    return { d: path, count: n };
  }, [value]);

  const quiet = 4; // modules of white border, per the QR spec
  const total = count + quiet * 2;
  return (
    <Svg width={size} height={size} viewBox={`${-quiet} ${-quiet} ${total} ${total}`} accessibilityLabel={label} accessibilityRole="image">
      <Rect x={-quiet} y={-quiet} width={total} height={total} fill={c.card} />
      <Path d={d} fill={c.ink} />
    </Svg>
  );
}
