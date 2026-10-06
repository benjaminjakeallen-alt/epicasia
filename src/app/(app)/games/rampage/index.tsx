import ArcadeBoard, { HERO } from '../../../../components/games/ArcadeBoard';

// Godzilla Rampage: a Play card and the group's high-score board. The game
// itself is ./play (full screen).

export default function Rampage() {
  return (
    <ArcadeBoard
      game="godzilla_rampage"
      title="Godzilla Rampage"
      tagline="Climb. Dodge. Rescue."
      blurb="Chris swings a pickaxe to save Emily. Shea swings a candy cane to save Heather. Godzilla has barrels."
      playHref="/(app)/games/rampage/play"
      playTestID="rampage-play"
      detail={(s) => `as ${HERO[s.hero]} · level ${s.level}${s.round > 1 ? `, round ${s.round}` : ''}`}
    />
  );
}
