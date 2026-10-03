import { Stack, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import GameFrame from '../../../../components/games/GameFrame';
import RAMPAGE_HTML from '../../../../games/rampage/html';
import { useAuth } from '../../../../lib/AuthProvider';
import { gameHaptic } from '../../../../lib/haptics';
import { peek } from '../../../../lib/offline';
import { localBest, parseRun, saveRun, type ScoreRow } from '../../../../lib/rampage';
import { useTheme } from '../../../../theme/useTheme';

// Godzilla Rampage, full screen. The game (assets/games/rampage.html) gets
// the HIGH SCORE to beat — the best of this phone's runs and the group's
// saved board — and reports each finished run back here to be saved.

export default function RampagePlay() {
  const router = useRouter();
  const colors = useTheme();
  const { session } = useAuth();
  const userId = session?.user.id;
  const [html, setHtml] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    (async () => {
      const [mine, board] = await Promise.all([localBest(), peek<ScoreRow[]>('game.rampage.scores')]);
      const top = Math.max(mine, ...(board ?? []).map((r) => r.score));
      const init = JSON.stringify({ highScore: top, debug: __DEV__ });
      if (live) setHtml(RAMPAGE_HTML.replace('/*INIT*/null', init));
    })();
    return () => {
      live = false;
    };
  }, []);

  const onMessage = useCallback(
    (msg: { type?: unknown } & Record<string, unknown>) => {
      if (msg.type === 'exit') {
        if (router.canGoBack()) router.back();
        else router.replace('/(app)/games/rampage');
      } else if (msg.type === 'score') {
        const run = parseRun(msg);
        if (run && userId) saveRun(userId, run).catch(() => {});
      } else if (msg.type === 'haptic') {
        gameHaptic(msg.kind);
      }
    },
    [router, userId],
  );

  return (
    <View style={[styles.screen, { backgroundColor: colors.arcade }]}>
      {/* Horizontal swipes are the game's: no swipe-back mid-jump. */}
      <Stack.Screen options={{ gestureEnabled: false, animation: 'fade' }} />
      <StatusBar style="light" />
      {html ? <GameFrame html={html} title="Godzilla Rampage" onMessage={onMessage} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({ screen: { flex: 1 } });
