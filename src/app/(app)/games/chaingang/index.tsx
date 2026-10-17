import ArcadeBoard, { HERO } from '../../../../components/games/ArcadeBoard';

// Tug of Wall: a Play card and the group's high-score board. The
// lobby (room codes) and the game itself are ./play.

export default function ChainGang() {
  return (
    <ArcadeBoard
      game="chain_gang"
      title="Tug of Wall"
      tagline="Roped together on the Great Wall."
      blurb="Up to four of you, tied together by a rope: hold on, reel each other in and cross four stretches of the Wall. Start a room and share its code, or practise with bots."
      playHref="/(app)/games/chaingang/play"
      playTestID="chain-play"
      detail={(s) => `as ${HERO[s.hero]} · ${s.level >= 4 ? 'all four stretches' : `${s.level} ${s.level === 1 ? 'stretch' : 'stretches'}`}`}
    />
  );
}
