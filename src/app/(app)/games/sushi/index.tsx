import ArcadeBoard, { HERO } from '../../../../components/games/ArcadeBoard';

// Sushi Conveyor: a Play card and the group's high-score board. The game
// itself is ./play (full screen).

export default function Sushi() {
  return (
    <ArcadeBoard
      game="sushi_conveyor"
      title="Sushi Conveyor"
      tagline="Catch the orders before they're gone."
      blurb="Tap the plates the order tickets ask for. Gold plates score triple, wasabi costs you time, and the belt keeps getting faster."
      playHref="/(app)/games/sushi/play"
      playTestID="sushi-play"
      detail={(s) => `as ${HERO[s.hero]} · belt ${s.level}`}
    />
  );
}
