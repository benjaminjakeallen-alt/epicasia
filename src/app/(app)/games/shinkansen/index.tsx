import ArcadeBoard, { HERO } from '../../../../components/games/ArcadeBoard';

// Shinkansen Dash: a Play card and the group's high-score board. The game
// itself is ./play (full screen).

const STAGE = ['Tokyo', 'the rice fields', 'Mount Fuji', 'the tea hills', 'Kyoto'];

export default function Shinkansen() {
  return (
    <ArcadeBoard
      game="shinkansen_dash"
      title="Shinkansen Dash"
      tagline="Tokyo to Kyoto, on the roof."
      blurb="Swipe to hop between three bullet trains, jump the fairings, slide under the gantries and grab every onigiri."
      playHref="/(app)/games/shinkansen/play"
      playTestID="dash-play"
      detail={(s) =>
        `as ${HERO[s.hero]} · ${s.round > 1 ? `round ${s.round}` : `reached ${STAGE[s.level - 1] ?? 'Tokyo'}`}`
      }
    />
  );
}
