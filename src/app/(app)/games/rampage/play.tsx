import { Stack, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import GameFrame from '../../../../components/games/GameFrame';
import RAMPAGE_HTML from '../../../../games/rampage/html';
import { useAuth } from '../../../../lib/AuthProvider';
import { selectionTick } from '../../../../lib/haptics';
import { peek } from '../../../../lib/offline';
import { girlPowerUnlocked, localBest, parseRun, saveRun, unlockGirlPower, type ScoreRow } from '../../../../lib/rampage';
import { useTheme } from '../../../../theme/useTheme';

// Godzilla Rampage, full screen. The game (assets/games/rampage.html) gets
// the HIGH SCORE to beat — the best of this phone's runs and the group's
// saved board — and whether this phone found the Girl Power secret — and
// reports each finished run back here to be saved.

export default function RampagePlay() {
  const router = useRouter();
  const colors = useTheme();
  const { session } = useAuth();
  const userId = session?.user.id;
  const [html, setHtml] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    (async () => {
      const [mine, board, girlPower] = await Promise.all([
        localBest(),
        peek<ScoreRow[]>('game.rampage.scores'),
        girlPowerUnlocked(),
      ]);
      const top = Math.max(mine, ...(board ?? []).map((r) => r.score));
      const init = JSON.stringify({ highScore: top, girlPower, debug: __DEV__ });
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
      } else if (msg.type === 'unlock' && msg.key === 'girlPower') {
        // The game's own storage is off (sandboxed null origin): the app remembers it.
        unlockGirlPower();
      } else if (msg.type === 'haptic') {
        selectionTick();
      }
    },
    [router, userId],
  );

  return (
    <View style={[styles.screen, { backgroundColor: colors.arcade }]}>
      {/* Horizontal swipes are the game's: no swipe-back mid-jump. */}
      <Stack.Screen options={{ gestureEnabled: false, animation: 'fade' }} />
      {html ? <GameFrame html={html} title="Godzilla Rampage" onMessage={onMessage} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({ screen: { flex: 1 } });
