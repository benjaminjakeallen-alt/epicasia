import { useCallback } from 'react';
import ArcadePlay from '../../../../components/games/ArcadePlay';
import RAMPAGE_HTML from '../../../../games/rampage/html';
import { girlPowerUnlocked, unlockGirlPower } from '../../../../lib/arcade';

// Godzilla Rampage, full screen. Besides the high score, the game is told
// whether this phone found the Girl Power secret, and tells us when it does.

const init = async () => ({ girlPower: await girlPowerUnlocked() });

export default function RampagePlay() {
  const onMessage = useCallback((msg: { type?: unknown; key?: unknown }) => {
    // The game's own storage is off (sandboxed null origin): the app remembers it.
    if (msg.type === 'unlock' && msg.key === 'girlPower') unlockGirlPower();
  }, []);
  return (
    <ArcadePlay
      game="godzilla_rampage"
      html={RAMPAGE_HTML}
      title="Godzilla Rampage"
      board="/(app)/games/rampage"
      init={init}
      onMessage={onMessage}
    />
  );
}
