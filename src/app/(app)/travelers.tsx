import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Avatar from '../../components/Avatar';
import CircleButton from '../../components/CircleButton';
import { DocsSkeleton } from '../../components/Skeleton';
import SkyBackdrop from '../../components/SkyBackdrop';
import { useAuth } from '../../lib/AuthProvider';
import { fetchMembers, type Member } from '../../lib/chat';
import { personColor } from '../../lib/chatFormat';
import { confirm } from '../../lib/confirm';
import { resetTravelerPassword } from '../../lib/profile';
import { colors as c, shadow } from '../../theme/colors';
import { fontFamily, type } from '../../theme/typography';

// Organizers only (Profile → Travelers): everyone on the trip, and a way to
// give someone a temporary password when the reset email doesn't arrive.
export default function Travelers() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { session } = useAuth();
  const myId = session?.user.id ?? '';
  const [members, setMembers] = useState<Member[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [issued, setIssued] = useState<{ id: string; name: string; password: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchMembers()
      .then(setMembers)
      .catch(() => setError('Could not load travelers'));
  }, []);

  async function reset(m: Member) {
    const first = m.name.split(' ')[0];
    if (
      !(await confirm(
        `Give ${first} a temporary password?`,
        `Their current password stops working. You’ll see the new one once — send it to ${first}, who can change it in Profile.`,
      ))
    )
      return;
    setBusy(m.id);
    setError(null);
    setCopied(false);
    try {
      setIssued({ id: m.id, name: first, password: await resetTravelerPassword(m.id) });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Couldn’t reset that password.');
    } finally {
      setBusy(null);
    }
  }

  return (
    <View style={[styles.screen, { backgroundColor: c.background }]}>
      <SkyBackdrop height={240} />
      <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
        <CircleButton icon="chevron-back" label="Back" onPress={() => router.back()} />
        <Text style={styles.title} accessibilityRole="header">
          Travelers
        </Text>
        <View style={styles.spacer} />
      </View>
      {!members ? (
        error ? (
          <Text style={[type.body, styles.pad, { color: c.danger }]}>{error}</Text>
        ) : (
          <DocsSkeleton label="Loading travelers" />
        )
      ) : (
        <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 40 }]}>
          {issued ? (
            <View style={styles.issued} accessibilityLiveRegion="polite" testID="temp-password">
              <Text style={[type.bodyStrong, { color: c.ink }]}>{issued.name}’s temporary password</Text>
              <Text style={styles.password} selectable>
                {issued.password}
              </Text>
              <Text style={[type.caption, { color: c.inkSecondary }]}>
                Send it to {issued.name}. They sign in with it, then change it in Profile → Change password.
              </Text>
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  Clipboard.setStringAsync(issued.password).then(() => setCopied(true));
                }}
                style={({ pressed }) => [styles.copy, { backgroundColor: pressed ? c.accentPressed : c.accent }]}
              >
                <Ionicons name={copied ? 'checkmark' : 'copy-outline'} size={18} color={c.onAccent} />
                <Text style={[type.bodyStrong, { color: c.onAccent }]}>{copied ? 'Copied' : 'Copy'}</Text>
              </Pressable>
            </View>
          ) : null}
          {error ? (
            <Text style={[type.body, { color: c.danger }]} accessibilityLiveRegion="assertive">
              {error}
            </Text>
          ) : null}
          {members.map((m, i) => (
            <View key={m.id} style={styles.row} testID="traveler-row">
              <Avatar name={m.name} path={m.avatar} color={personColor(i)} size={40} />
              <Text style={[type.bodyStrong, styles.flex, { color: c.ink }]} numberOfLines={1}>
                {m.name}
                {m.id === myId ? ' (you)' : ''}
              </Text>
              {m.id !== myId ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Reset ${m.name}’s password`}
                  disabled={busy === m.id}
                  onPress={() => reset(m)}
                  style={({ pressed }) => [styles.reset, { backgroundColor: pressed ? c.surfacePressed : c.accentSoft }]}
                >
                  <Ionicons name="key-outline" size={16} color={c.highlight} />
                  <Text style={[styles.resetText, { color: c.highlight }]}>{busy === m.id ? 'Resetting…' : 'Reset password'}</Text>
                </Pressable>
              ) : null}
            </View>
          ))}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  flex: { flex: 1 },
  pad: { paddingHorizontal: 20 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 12,
  },
  title: { fontFamily: fontFamily.display, fontSize: 22, letterSpacing: -0.2, color: c.ink },
  spacer: { width: 44 },
  content: { paddingHorizontal: 20, gap: 10 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 64,
    borderRadius: 18,
    paddingHorizontal: 14,
    backgroundColor: c.card,
    boxShadow: shadow.card,
  },
  reset: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 44, paddingHorizontal: 12, borderRadius: 22 },
  resetText: { fontFamily: fontFamily.bodySemiBold, fontSize: 13.5 },
  issued: { backgroundColor: c.card, borderRadius: 20, padding: 18, gap: 8, boxShadow: shadow.float },
  password: { fontFamily: fontFamily.mono, fontSize: 22, color: c.ink, letterSpacing: 0.5 },
  copy: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    height: 44,
    paddingHorizontal: 18,
    borderRadius: 22,
    marginTop: 4,
  },
});
