import { useCallback } from 'react';
import ArcadePlay from '../../../../components/games/ArcadePlay';
import SUSHI_HTML from '../../../../games/sushi/html';
import { saveSushiSeat, sushiSeat } from '../../../../lib/arcade';

// Sushi Conveyor, full screen. The game's own storage is off in its sandbox, so
// the app remembers who sat at the counter, and the late-night counter once the
// game says it was found.

const init = async () => sushiSeat();

export default function SushiPlay() {
  const onMessage = useCallback((msg: { type?: unknown; key?: unknown; hero?: unknown; counter?: unknown }) => {
    if (msg.type === 'seat') saveSushiSeat({ hero: msg.hero, counter: msg.counter });
    else if (msg.type === 'unlock' && msg.key === 'night') saveSushiSeat({ night: true });
  }, []);
  return (
    <ArcadePlay
      game="sushi_conveyor"
      html={SUSHI_HTML}
      title="Sushi Conveyor"
      board="/(app)/games/sushi"
      init={init}
      onMessage={onMessage}
    />
  );
}
