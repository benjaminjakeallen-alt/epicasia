import { useCallback } from 'react';
import ArcadePlay from '../../../../components/games/ArcadePlay';
import SHINKANSEN_HTML from '../../../../games/shinkansen/html';
import { bestDistance, saveBestDistance, unlockHero, unlockedHeroes } from '../../../../lib/arcade';

// Shinkansen Dash, full screen. Some travellers are secrets earned in the
// game (see UNLOCK in its game.js); the game's own storage is off in its sandbox,
// so the app remembers what this phone has unlocked (and its best distance, for the gold
// "your best" gate) and tells the game.

const init = async () => ({ unlocked: await unlockedHeroes('shinkansen_dash'), bestDist: await bestDistance('shinkansen_dash') });

export default function ShinkansenPlay() {
  const onMessage = useCallback((msg: { type?: unknown; key?: unknown; dist?: unknown }) => {
    if (msg.type === 'unlock') unlockHero('shinkansen_dash', msg.key);
    else if (msg.type === 'best') saveBestDistance('shinkansen_dash', msg.dist);
  }, []);
  return (
    <ArcadePlay
      game="shinkansen_dash"
      html={SHINKANSEN_HTML}
      title="Shinkansen Dash"
      board="/(app)/games/shinkansen"
      init={init}
      onMessage={onMessage}
    />
  );
}
