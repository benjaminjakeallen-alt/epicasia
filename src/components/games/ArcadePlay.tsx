import { Stack, useRouter, type Href } from 'expo-router';
import { useCallback, useEffect, useState, type MutableRefObject } from 'react';
import { StyleSheet, View } from 'react-native';
import { localBest, markTipsSeen, parseRun, saveRun, scoresCache, tipsSeen, type ArcadeGame, type ScoreRow } from '../../lib/arcade';
import { useAuth } from '../../lib/AuthProvider';
import { selectionTick } from '../../lib/haptics';
import { peek } from '../../lib/offline';
import { useTheme } from '../../theme/useTheme';
import GameFrame from './GameFrame';

type Message = { type?: unknown } & Record<string, unknown>;

// An arcade game full screen (Godzilla Rampage, Shinkansen Dash, Tug of Wall). The game
// gets the HIGH SCORE to beat — the best of this phone's runs and the
// group's saved board — plus anything the game's screen adds (`init`), and
// reports each finished run back here to be saved. The first time a phone plays a
// game it's also told `tips: true` and shows how to play (then posts `tips-seen`).

export default function ArcadePlay({
  game,
  html,
  title,
  board,
  init,
  onMessage,
  postRef,
}: {
  game: ArcadeGame;
  /** The game's built HTML (src/games/<slug>/html.ts) with its `/*INIT*\/null` placeholder. */
  html: string;
  title: string;
  /** Where ✕ / Leave goes if there's nothing to go back to. */
  board: Href;
  init?: () => Promise<Record<string, unknown>>;
  onMessage?: (msg: Message) => void;
  postRef?: MutableRefObject<((data: unknown) => void) | null>;
}) {
  const router = useRouter();
  const colors = useTheme();
  const { session } = useAuth();
  const userId = session?.user.id;
  const [page, setPage] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    (async () => {
      const [mine, rows, extra, seen] = await Promise.all([
        localBest(game),
        peek<ScoreRow[]>(scoresCache(game)),
        init ? init() : Promise.resolve({}),
        tipsSeen(game),
      ]);
      const top = Math.max(mine, ...(rows ?? []).map((r) => r.score));
      // tips: the first time this phone plays this game, it shows how to play
      const json = JSON.stringify({ highScore: top, debug: __DEV__, tips: !seen, ...extra });
      if (live) setPage(html.replace('/*INIT*/null', json));
    })();
    return () => {
      live = false;
    };
    // init is read once, when the game opens
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game, html]);

  const handle = useCallback(
    (msg: Message) => {
      if (msg.type === 'exit') {
        if (router.canGoBack()) router.back();
        else router.replace(board);
      } else if (msg.type === 'score') {
        const run = parseRun(msg);
        if (run && userId) saveRun(userId, game, run).catch(() => {});
      } else if (msg.type === 'haptic') {
        selectionTick();
      } else if (msg.type === 'tips-seen') {
        markTipsSeen(game);
      } else onMessage?.(msg);
    },
    [router, userId, game, board, onMessage],
  );

  return (
    <View style={[styles.screen, { backgroundColor: colors.arcade }]}>
      {/* Horizontal swipes are the game's: no swipe-back mid-jump. */}
      <Stack.Screen options={{ gestureEnabled: false, animation: 'fade' }} />
      {page ? <GameFrame html={page} title={title} onMessage={handle} postRef={postRef} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({ screen: { flex: 1 } });
