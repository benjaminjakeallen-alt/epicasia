import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import CircleButton from '../../../../components/CircleButton';
import SkyBackdrop from '../../../../components/SkyBackdrop';
import FormButton from '../../../../components/form/FormButton';
import ArcadePlay from '../../../../components/games/ArcadePlay';
import CHAINGANG_HTML from '../../../../games/chaingang/html';
import { useAuth } from '../../../../lib/AuthProvider';
import {
  CHAIN_HEROES,
  CHAIN_HERO_NAMES,
  MAX_PLAYERS,
  joinRoom,
  lineUp,
  makeCode,
  normalizeCode,
  sortMembers,
  type ChainHero,
  type LineUp,
  type Room,
  type RoomMember,
} from '../../../../lib/chainGangRoom';
import { fontFamily, type } from '../../../../theme/typography';
import { useTheme } from '../../../../theme/useTheme';

// Chain Gang Dynasty: pick a traveller, then start a room (and share its
// code), join one with a code, or practise with bots. In a room the host
// starts the game for everyone; the game runs in ArcadePlay's iframe and
// this screen relays its network messages to and from the room
// (src/lib/chainGangRoom.ts). Leaving the game leaves the room.

const HERO_KEY = 'epicasia.chaingang.hero';
type Phase = 'menu' | 'lobby' | 'game';
type Game = { mode: 'solo' | 'host' | 'client'; me: number; players: LineUp };

export default function ChainGangPlay() {
  const insets = useSafeAreaInsets();
  const colors = useTheme();
  const router = useRouter();
  const { session } = useAuth();
  const myName = ((session?.user.user_metadata?.display_name as string | undefined) ?? 'Traveller').split(' ')[0];

  const [phase, setPhase] = useState<Phase>('menu');
  const [hero, setHero] = useState<ChainHero>('chris');
  const [joinText, setJoinText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [room, setRoom] = useState<Room | null>(null);
  const [host, setHost] = useState(false);
  const [members, setMembers] = useState<RoomMember[]>([]);
  const [bots, setBots] = useState(true);
  const [game, setGame] = useState<Game | null>(null);
  const [timedOut, setTimedOut] = useState(false); // (a joined code nobody is hosting)
  const heroRef = useRef<ChainHero>('chris');
  const postRef = useRef<((data: unknown) => void) | null>(null);
  const roomRef = useRef<Room | null>(null);
  const gameRef = useRef<Game | null>(null);
  // (the ref is set first: ArcadePlay reads the line-up as it mounts)
  const begin = (g: Game) => {
    gameRef.current = g;
    setGame(g);
    setPhase('game');
  };

  useEffect(() => {
    AsyncStorage.getItem(HERO_KEY)
      .then((h) => {
        const k = CHAIN_HEROES.find((x) => x === h);
        if (k) {
          heroRef.current = k;
          setHero(k);
        }
      })
      .catch(() => {});
  }, []);
  const pickHero = (h: ChainHero) => {
    heroRef.current = h;
    setHero(h);
    AsyncStorage.setItem(HERO_KEY, h).catch(() => {});
    roomRef.current?.update({ hero: h });
  };

  // leaving the screen leaves the room
  useEffect(() => () => roomRef.current?.leave(), []);

  const open = useCallback(
    (code: string, asHost: boolean) => {
      setError(null);
      setTimedOut(false);
      roomRef.current?.leave();
      setHost(asHost);
      const r = joinRoom(code, { name: myName, host: asHost }, {
        onMembers: (list) => {
          setMembers(list);
          // someone who joined first has my traveller: take a free one
          const order = sortMembers(list), mine = order.findIndex((m) => m.id === r.me);
          const taken = (h: ChainHero) => order.some((m, i) => i < mine && m.hero === h);
          if (mine >= 0 && taken(heroRef.current)) {
            const free = CHAIN_HEROES.find((h) => !taken(h));
            if (free) pickHero(free);
          }
        },
        onStart: (payload) => {
          const me = payload.players.findIndex((p) => p.id === r.me);
          if (me < 0) return; // started without us (the room was full)
          begin({ mode: 'client', me, players: payload.players });
        },
        onGame: (msg) => postRef.current?.({ source: 'chaingang-app', type: 'net', msg }),
        onStatus: (s) => {
          if (s === 'error') setError("Couldn't reach the room. Check your connection and try again.");
        },
      });
      r.update({ hero: heroRef.current });
      roomRef.current = r;
      setRoom(r);
      setMembers([]);
      setPhase('lobby');
    },
    [myName],
  );

  const sorted = useMemo(() => sortMembers(members), [members]);
  const myIndex = room ? sorted.findIndex((m) => m.id === room.me) : -1;
  const roomHost = sorted.find((m) => m.host) ?? null;
  const takenByOthers = (h: ChainHero) => sorted.some((m) => m.id !== room?.me && m.hero === h);
  const full = myIndex >= MAX_PLAYERS;

  // a code with no host behind it
  useEffect(() => {
    if (phase !== 'lobby' || host) return;
    const t = setTimeout(() => setTimedOut(true), 4000);
    return () => clearTimeout(t);
  }, [phase, host, room]);
  const alone = timedOut && !roomHost;

  // mid-game: tell the game who has gone
  useEffect(() => {
    const g = gameRef.current;
    if (phase !== 'game' || !g || g.mode === 'solo') return;
    const here = new Set(members.map((m) => m.id));
    g.players.forEach((p, i) => {
      if (!p.id || p.bot || here.has(p.id)) return;
      if (g.mode === 'host') postRef.current?.({ source: 'chaingang-app', type: 'peer-left', i });
      else if (i === 0) postRef.current?.({ source: 'chaingang-app', type: 'host-left' });
    });
  }, [members, phase]);

  const start = () => {
    if (!room) return;
    const players = lineUp(sorted, bots);
    room.start({ players });
    begin({ mode: 'host', me: players.findIndex((p) => p.id === room.me), players });
  };
  const practise = () => {
    begin({ mode: 'solo', me: 0, players: [] });
  };
  const leaveRoom = () => {
    roomRef.current?.leave();
    roomRef.current = null;
    setRoom(null);
    setPhase('menu');
  };
  const share = async () => {
    if (!room) return;
    const text = `Join my Chain Gang Dynasty room in Epic Asia: ${room.code}`;
    try {
      if (navigator.share) await navigator.share({ text });
      else await navigator.clipboard.writeText(room.code);
    } catch {
      /* dismissed */
    }
  };

  const onGameMessage = useCallback((msg: { type?: unknown; msg?: unknown }) => {
    if (msg.type === 'net') roomRef.current?.send(msg.msg);
  }, []);
  const init = useCallback(async () => {
    const g = gameRef.current;
    if (!g || g.mode === 'solo') return { mode: 'solo', hero };
    return { mode: g.mode, me: g.me, players: g.players.map((p) => ({ hero: p.hero, name: p.name, bot: p.bot })) };
  }, [hero]);

  if (phase === 'game' && game) {
    return (
      <ArcadePlay
        game="chain_gang"
        html={CHAINGANG_HTML}
        title="Chain Gang Dynasty"
        board="/(app)/games/chaingang"
        init={init}
        onMessage={onGameMessage}
        postRef={postRef}
      />
    );
  }

  const heroRow = (disabled: (h: ChainHero) => boolean) => (
    <View style={styles.heroes} accessibilityRole="radiogroup" accessibilityLabel="Your traveller">
      {CHAIN_HEROES.map((h) => {
        const on = hero === h, off = disabled(h);
        return (
          <Pressable
            key={h}
            testID={`hero-${h}`}
            accessibilityRole="radio"
            accessibilityState={{ checked: on, disabled: off }}
            aria-checked={on}
            disabled={off}
            onPress={() => pickHero(h)}
            style={[
              styles.hero,
              { backgroundColor: on ? colors.accent : colors.card, borderColor: on ? colors.accent : colors.border, opacity: off ? 0.45 : 1 },
            ]}
          >
            <Text style={[styles.heroText, { color: on ? colors.onAccent : colors.ink }]}>{CHAIN_HERO_NAMES[h]}</Text>
          </Pressable>
        );
      })}
    </View>
  );

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <SkyBackdrop />
      <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
        <CircleButton icon="chevron-back" label="Back" onPress={() => (phase === 'lobby' ? leaveRoom() : router.back())} />
        <Text style={[styles.headerTitle, { color: colors.ink }]} accessibilityRole="header" numberOfLines={1}>
          Chain Gang Dynasty
        </Text>
        <View style={styles.spacer} />
      </View>

      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]} keyboardShouldPersistTaps="handled">
        {phase === 'menu' ? (
          <>
            <Text style={[styles.section, { color: colors.ink }]} accessibilityRole="header">
              Your traveller
            </Text>
            {heroRow(() => false)}

            <View style={[styles.card, { backgroundColor: colors.card }]}>
              <Text style={[styles.cardTitle, { color: colors.ink }]}>Play together</Text>
              <Text style={[type.body, { color: colors.inkSecondary }]}>
                Start a room and read out its code. Up to four phones, each on its own.
              </Text>
              <FormButton label="Start a room" onPress={() => open(makeCode(), true)} />
              <View style={styles.joinRow}>
                <TextInput
                  testID="join-code"
                  value={joinText}
                  onChangeText={(t) => setJoinText(t.toUpperCase().slice(0, 6))}
                  placeholder="Code"
                  placeholderTextColor={colors.inkTertiary}
                  autoCapitalize="characters"
                  autoCorrect={false}
                  accessibilityLabel="Room code"
                  style={[styles.code, { color: colors.ink, backgroundColor: colors.background, borderColor: colors.border }]}
                  onSubmitEditing={() => {
                    const c = normalizeCode(joinText);
                    if (c) open(c, false);
                    else setError('A room code is four letters and numbers, like K7QM.');
                  }}
                />
                <Pressable
                  testID="join-room"
                  accessibilityRole="button"
                  onPress={() => {
                    const c = normalizeCode(joinText);
                    if (c) open(c, false);
                    else setError('A room code is four letters and numbers, like K7QM.');
                  }}
                  style={({ pressed }) => [styles.join, { backgroundColor: pressed ? colors.accentPressed : colors.accent }]}
                >
                  <Text style={[styles.joinText, { color: colors.onAccent }]}>Join</Text>
                </Pressable>
              </View>
              {error ? <Text style={[type.body, { color: colors.error }]}>{error}</Text> : null}
            </View>

            <View style={[styles.card, { backgroundColor: colors.card }]}>
              <Text style={[styles.cardTitle, { color: colors.ink }]}>Practise</Text>
              <Text style={[type.body, { color: colors.inkSecondary }]}>You and three bot travellers, on this phone.</Text>
              <Pressable
                testID="chain-practise"
                accessibilityRole="button"
                onPress={practise}
                style={({ pressed }) => [styles.secondary, { borderColor: colors.accent, backgroundColor: pressed ? colors.accentSoft : 'transparent' }]}
              >
                <Ionicons name="play" size={16} color={colors.highlight} />
                <Text style={[styles.secondaryText, { color: colors.highlight }]}>Practise with bots</Text>
              </Pressable>
            </View>
          </>
        ) : room ? (
          <>
            <View style={[styles.card, { backgroundColor: colors.card }]}>
              <Text style={[type.body, { color: colors.inkSecondary }]}>Room code</Text>
              <Text testID="room-code" style={[styles.bigCode, { color: colors.ink }]} accessibilityLabel={`Room code ${room.code.split('').join(' ')}`}>
                {room.code}
              </Text>
              <Pressable
                accessibilityRole="button"
                onPress={share}
                style={({ pressed }) => [styles.secondary, { borderColor: colors.accent, backgroundColor: pressed ? colors.accentSoft : 'transparent' }]}
              >
                <Ionicons name="share-outline" size={16} color={colors.highlight} />
                <Text style={[styles.secondaryText, { color: colors.highlight }]}>Share the code</Text>
              </Pressable>
            </View>

            {full ? (
              <Text style={[type.body, { color: colors.error }]}>This room already has four travellers.</Text>
            ) : alone ? (
              <Text style={[type.body, { color: colors.error }]} testID="no-host">
                Nobody is hosting room {room.code}. Check the code with whoever started it.
              </Text>
            ) : null}
            {error ? <Text style={[type.body, { color: colors.error }]}>{error}</Text> : null}

            <Text style={[styles.section, { color: colors.ink }]} accessibilityRole="header">
              The gang
            </Text>
            <View style={[styles.board, { backgroundColor: colors.card }]}>
              {sorted.slice(0, MAX_PLAYERS).map((m, i) => (
                <View key={m.id} testID="gang-member" style={[styles.member, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.separator }]}>
                  <Text style={[styles.memberName, { color: colors.ink }]}>
                    {m.id === room.me ? `${m.name} (you)` : m.name}
                  </Text>
                  <Text style={[type.body, { color: colors.inkSecondary }]}>
                    {m.hero ? CHAIN_HERO_NAMES[m.hero] : 'Choosing…'}
                    {m.host ? ' · host' : ''}
                  </Text>
                </View>
              ))}
            </View>

            <Text style={[styles.section, { color: colors.ink }]} accessibilityRole="header">
              Your traveller
            </Text>
            {heroRow(takenByOthers)}

            {host ? (
              <>
                <Pressable
                  testID="fill-bots"
                  accessibilityRole="switch"
                  accessibilityState={{ checked: bots }}
                  aria-checked={bots}
                  onPress={() => setBots((b) => !b)}
                  style={[styles.switchRow, { backgroundColor: colors.card }]}
                >
                  <Text style={[type.body, { color: colors.ink, flex: 1 }]}>Fill empty places with bots</Text>
                  <View style={[styles.track, { backgroundColor: bots ? colors.accent : colors.border }]}>
                    <View style={[styles.thumb, { backgroundColor: colors.card, alignSelf: bots ? 'flex-end' : 'flex-start' }]} />
                  </View>
                </Pressable>
                <FormButton
                  label="Start the game"
                  onPress={start}
                  disabled={sorted.length < 1 || sorted.slice(0, MAX_PLAYERS).some((m) => !m.hero) || (!bots && sorted.length < 2)}
                />
              </>
            ) : (
              <Text style={[type.body, { color: colors.inkSecondary }]} testID="waiting-host">
                {roomHost ? `Waiting for ${roomHost.name} to start…` : 'Looking for the room…'}
              </Text>
            )}
            <FormButton label="Leave the room" variant="text" onPress={leaveRoom} />
          </>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingBottom: 8, gap: 12 },
  headerTitle: { ...type.title, flex: 1, textAlign: 'center' },
  spacer: { width: 44 },
  content: { padding: 16, gap: 14 },
  section: { ...type.cardTitle, marginTop: 6 },
  heroes: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  hero: { minHeight: 44, paddingHorizontal: 16, borderRadius: 22, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  heroText: { fontFamily: fontFamily.bodyMedium, fontSize: 16 },
  card: { borderRadius: 22, padding: 18, gap: 12 },
  cardTitle: { fontFamily: fontFamily.displayMedium, fontSize: 22 },
  joinRow: { flexDirection: 'row', gap: 10 },
  code: { flex: 1, minWidth: 0, width: '100%', minHeight: 50, borderRadius: 16, borderWidth: 1, paddingHorizontal: 14, fontFamily: fontFamily.mono, fontSize: 22, letterSpacing: 4 },
  join: { minWidth: 88, minHeight: 50, borderRadius: 25, alignItems: 'center', justifyContent: 'center' },
  joinText: { fontFamily: fontFamily.bodyMedium, fontSize: 17 },
  secondary: { flexDirection: 'row', gap: 8, minHeight: 48, borderRadius: 24, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  secondaryText: { fontFamily: fontFamily.bodyMedium, fontSize: 16 },
  bigCode: { fontFamily: fontFamily.mono, fontSize: 48, letterSpacing: 10 },
  board: { borderRadius: 20, paddingHorizontal: 16 },
  member: { paddingVertical: 12, gap: 2 },
  memberName: { fontFamily: fontFamily.bodyMedium, fontSize: 17 },
  switchRow: { flexDirection: 'row', alignItems: 'center', minHeight: 56, borderRadius: 18, paddingHorizontal: 16, gap: 12 },
  track: { width: 50, height: 30, borderRadius: 15, padding: 3, justifyContent: 'center' },
  thumb: { width: 24, height: 24, borderRadius: 12 },
});
