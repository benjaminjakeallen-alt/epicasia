import { useCallback } from 'react';
import ArcadePlay from '../../../../components/games/ArcadePlay';
import SHINKANSEN_HTML from '../../../../games/shinkansen/html';
import { unlockHero, unlockedHeroes } from '../../../../lib/arcade';

// Shinkansen Dash, full screen. Emily and Heather are earned in the game
// (reach Mount Fuji / Kyoto); the game's own storage is off in its sandbox,
// so the app remembers what this phone has unlocked and tells the game.

const init = async () => ({ unlocked: await unlockedHeroes('shinkansen_dash') });

export default function ShinkansenPlay() {
  const onMessage = useCallback((msg: { type?: unknown; key?: unknown }) => {
    if (msg.type === 'unlock') unlockHero('shinkansen_dash', msg.key);
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
