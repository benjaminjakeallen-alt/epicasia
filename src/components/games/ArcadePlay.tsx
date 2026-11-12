import { Stack, useRouter, type Href } from 'expo-router';
import { useCallback, useEffect, useState, type MutableRefObject } from 'react';
import { Animated, Image, StyleSheet, Text, View } from 'react-native';
import { localBest, markTipsSeen, parseRun, saveRun, scoresCache, tipsSeen, type ArcadeGame, type ScoreRow } from '../../lib/arcade';
import { useAuth } from '../../lib/AuthProvider';
import { GAMES } from '../../lib/games';
import { selectionTick } from '../../lib/haptics';
import { peek } from '../../lib/offline';
import { usePresence } from '../../lib/socialMotion';
import { fontFamily } from '../../theme/typography';
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
  // The game takes a moment to start (seconds on a phone): its icon waits on a dark stage until the frame has loaded.
  const [loaded, setLoaded] = useState(false);
  const cover = usePresence(!loaded, 260);
  const icon = GAMES.find((g) => g.key === game)?.image;

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
      {page ? <GameFrame html={page} title={title} onMessage={handle} postRef={postRef} onLoad={() => setLoaded(true)} /> : null}
      {cover.mounted ? (
        <Animated.View
          pointerEvents="none"
          style={[StyleSheet.absoluteFill, styles.cover, { backgroundColor: colors.arcade, opacity: cover.t }]}
          accessibilityRole="progressbar"
          accessibilityLabel={`Loading ${title}`}
          testID="game-loading"
        >
          {icon ? <Image source={icon} style={styles.coverIcon} resizeMode="contain" accessibilityLabel="" /> : null}
          <Text style={[styles.coverTitle, { color: colors.onMedia }]}>{title}</Text>
        </Animated.View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  cover: { alignItems: 'center', justifyContent: 'center', gap: 18 },
  coverIcon: { width: 168, height: 168 },
  coverTitle: { fontFamily: fontFamily.display, fontSize: 26, letterSpacing: -0.2 },
});
