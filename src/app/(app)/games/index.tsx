import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, PanResponder, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import CircleButton from '../../../components/CircleButton';
import SkyBackdrop from '../../../components/SkyBackdrop';
import { selectionTick } from '../../../lib/haptics';
import { GAMES } from '../../../lib/games';
import { shadow } from '../../../theme/colors';
import { fontFamily, type } from '../../../theme/typography';
import { useTheme } from '../../../theme/useTheme';

// Games hub: a spotlight stage. The chosen game's 3D icon floats large on a
// sage halo (bobbing, swaying, its shadow breathing under it); tiles below
// pick the game, or swipe across the stage. Switching springs the new icon
// in with a sparkle burst. Play opens the game. (Not a ring — the user asked
// for something other than the home orbit menu.) Photo games score by
// upvotes (game_entries/game_votes), arcade games by runs (game_scores).

const SPARKS = 8;

export default function Games() {
  const insets = useSafeAreaInsets();
  const colors = useTheme();
  const router = useRouter();
  const [index, setIndex] = useState(0);
  const game = GAMES[index];

  const float = useRef(new Animated.Value(0)).current; // 0..1 loop
  const pop = useRef(new Animated.Value(1)).current; // 0 → 1 on each switch
  const spark = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    let loop: Animated.CompositeAnimation | null = null;
    AccessibilityInfo.isReduceMotionEnabled().then((reduce) => {
      if (reduce) return;
      loop = Animated.loop(
        Animated.timing(float, { toValue: 1, duration: 3200, easing: Easing.linear, useNativeDriver: true }),
      );
      loop.start();
    });
    return () => loop?.stop();
  }, [float]);

  function choose(i: number) {
    const next = (i + GAMES.length) % GAMES.length;
    if (next === index) return;
    selectionTick();
    setIndex(next);
    pop.setValue(0);
    spark.setValue(0);
    Animated.parallel([
      Animated.spring(pop, { toValue: 1, friction: 5, tension: 120, useNativeDriver: true }),
      Animated.timing(spark, { toValue: 1, duration: 650, easing: Easing.out(Easing.quad), useNativeDriver: true }),
    ]).start();
  }

  // Swipe across the stage to switch games.
  const chooseRef = useRef(choose);
  chooseRef.current = choose;
  const indexRef = useRef(index);
  indexRef.current = index;
  const pan = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 14 && Math.abs(g.dx) > Math.abs(g.dy),
      onPanResponderRelease: (_, g) => {
        if (g.dx < -40) chooseRef.current(indexRef.current + 1);
        else if (g.dx > 40) chooseRef.current(indexRef.current - 1);
      },
    }),
  ).current;

  // one full float cycle: up-down bob, a gentle sway, and the shadow breathing
  const wave = (a: number, b: number) =>
    float.interpolate({ inputRange: [0, 0.25, 0.5, 0.75, 1], outputRange: [0, a, 0, b, 0] });
  const bob = wave(-10, 6);
  const sway = float.interpolate({ inputRange: [0, 0.5, 1], outputRange: ['-4deg', '4deg', '-4deg'] });
  const shadowScale = float.interpolate({ inputRange: [0, 0.25, 0.5, 0.75, 1], outputRange: [1, 0.8, 1, 1.07, 1] });
  const iconScale = pop.interpolate({ inputRange: [0, 1], outputRange: [0.55, 1] });
  const iconOpacity = pop.interpolate({ inputRange: [0, 0.3, 1], outputRange: [0, 1, 1] });

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <SkyBackdrop />
      <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
        <CircleButton icon="chevron-back" label="Back" onPress={() => router.back()} />
        <Text style={[styles.headerTitle, { color: colors.ink }]} accessibilityRole="header">
          Games
        </Text>
        <CircleButton
          icon="trophy-outline"
          label="Leaderboard"
          onPress={() => router.push('/(app)/games/leaderboard')}
          testID="games-leaderboard"
        />
      </View>

      <View style={styles.stage} {...pan.panHandlers}>
        <Animated.View style={[styles.shadow, { backgroundColor: colors.stageShadow, transform: [{ scaleX: shadowScale }] }]} />
        <View style={[styles.halo, { backgroundColor: colors.card, boxShadow: shadow.glow }]} />
        {Array.from({ length: SPARKS }, (_, i) => {
          const a = (i / SPARKS) * Math.PI * 2;
          const out = spark.interpolate({ inputRange: [0, 1], outputRange: [0, 120] });
          return (
            <Animated.View
              key={i}
              style={[
                styles.spark,
                {
                  backgroundColor: i % 2 ? colors.gold : colors.accent,
                  opacity: spark.interpolate({ inputRange: [0, 0.15, 1], outputRange: [0, 1, 0] }),
                  transform: [
                    { translateX: Animated.multiply(out, Math.cos(a)) },
                    { translateY: Animated.multiply(out, Math.sin(a)) },
                    { scale: spark.interpolate({ inputRange: [0, 1], outputRange: [1.4, 0.4] }) },
                  ],
                },
              ]}
            />
          );
        })}
        <Pressable
          testID="games-hero"
          accessibilityRole="button"
          accessibilityLabel={`Play ${game.title}`}
          onPress={() => router.push(game.href)}
        >
          <Animated.View
            style={{ opacity: iconOpacity, transform: [{ translateY: bob }, { rotate: sway }, { scale: iconScale }] }}
          >
            <Image source={game.image} style={styles.hero} contentFit="contain" accessibilityLabel="" />
          </Animated.View>
        </Pressable>
      </View>

      <View style={styles.info}>
        <Text style={[styles.title, { color: colors.ink }]} accessibilityRole="header" testID="games-title">
          {game.title}
        </Text>
        <Text style={[type.body, styles.line, { color: colors.inkSecondary }]}>{game.line}</Text>
        <Pressable
          testID="games-play"
          accessibilityRole="button"
          accessibilityLabel={`Play ${game.title}`}
          onPress={() => router.push(game.href)}
          style={({ pressed }) => [styles.play, { backgroundColor: pressed ? colors.accentPressed : colors.accent }]}
        >
          <Text style={[styles.playText, { color: colors.onAccent }]}>Play</Text>
        </Pressable>
      </View>

      <View style={[styles.tiles, { paddingBottom: insets.bottom + 22 }]} accessibilityRole="tablist">
        {GAMES.map((g, i) => {
          const on = i === index;
          return (
            <Pressable
              key={g.key}
              testID={`game-${g.key}`}
              accessibilityRole="tab"
              accessibilityLabel={g.title}
              accessibilityState={{ selected: on }}
              aria-selected={on}
              onPress={() => choose(i)}
              style={[
                styles.tile,
                {
                  backgroundColor: colors.card,
                  borderColor: on ? colors.accent : colors.card,
                  transform: [{ translateY: on ? -6 : 0 }],
                  boxShadow: on ? shadow.float : shadow.card,
                },
              ]}
            >
              <Image source={g.image} style={styles.tileImage} contentFit="contain" accessibilityLabel="" />
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 4,
  },
  headerTitle: { fontFamily: fontFamily.display, fontSize: 22, letterSpacing: -0.2 },
  stage: { flex: 1, minHeight: 260, alignItems: 'center', justifyContent: 'center' },
  halo: { position: 'absolute', width: 230, height: 230, borderRadius: 115, opacity: 0.9 },
  shadow: { position: 'absolute', bottom: '6%', width: 130, height: 14, borderRadius: 7, boxShadow: shadow.stage },
  spark: { position: 'absolute', width: 10, height: 10, borderRadius: 3 },
  hero: { width: 240, height: 240 },
  info: { alignItems: 'center', paddingHorizontal: 28, gap: 8 },
  title: { fontFamily: fontFamily.display, fontSize: 32, lineHeight: 38, textAlign: 'center' },
  line: { textAlign: 'center' },
  play: {
    marginTop: 8,
    height: 54,
    minWidth: 180,
    paddingHorizontal: 34,
    borderRadius: 27,
    alignItems: 'center',
    justifyContent: 'center',
  },
  playText: { fontFamily: fontFamily.bodySemiBold, fontSize: 17 },
  tiles: { flexDirection: 'row', justifyContent: 'center', gap: 16, paddingTop: 26 },
  tile: {
    width: 84,
    height: 84,
    borderRadius: 24,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tileImage: { width: 66, height: 66 },
});
