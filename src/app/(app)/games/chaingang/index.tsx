import ArcadeBoard, { HERO } from '../../../../components/games/ArcadeBoard';

// Chain Gang Dynasty: a Play card and the group's high-score board. The
// lobby (room codes) and the game itself are ./play.

export default function ChainGang() {
  return (
    <ArcadeBoard
      game="chain_gang"
      title="Chain Gang Dynasty"
      tagline="Chained together on the Great Wall."
      blurb="Up to four of you, linked by a gold chain: hold on, haul each other up and cross three stretches of the Wall. Start a room and share its code, or practise with bots."
      playHref="/(app)/games/chaingang/play"
      playTestID="chain-play"
      detail={(s) => `as ${HERO[s.hero]} · ${s.level >= 3 ? 'all three stretches' : `${s.level} ${s.level === 1 ? 'stretch' : 'stretches'}`}`}
    />
  );
}
