import ArcadePlay from '../../../../components/games/ArcadePlay';
import SHINKANSEN_HTML from '../../../../games/shinkansen/html';

// Shinkansen Dash, full screen.

export default function ShinkansenPlay() {
  return (
    <ArcadePlay game="shinkansen_dash" html={SHINKANSEN_HTML} title="Shinkansen Dash" board="/(app)/games/shinkansen" />
  );
}
