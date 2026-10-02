import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Linking, Pressable, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import CircleButton from '../../components/CircleButton';
import FormField from '../../components/form/FormField';
import QrCode from '../../components/QrCode';
import { Bone } from '../../components/Skeleton';
import SkyBackdrop from '../../components/SkyBackdrop';
import { useAuth } from '../../lib/AuthProvider';
import { confirm } from '../../lib/confirm';
import { formatMonthDay } from '../../lib/dates';
import {
  createInvite,
  fetchInvites,
  inviteLink,
  inviteMessage,
  isActive,
  revokeInvite,
  type Invite,
} from '../../lib/invites';
import { fetchProfile } from '../../lib/profile';
import { colors as c, shadow } from '../../theme/colors';
import { fontFamily, type } from '../../theme/typography';

// Trip organizers (admins) create invite codes and share them by message,
// email or QR. New accounts can only be made with a current code.

const USES: { label: string; value: number | null }[] = [
  { label: 'Unlimited', value: null },
  { label: '1 person', value: 1 },
  { label: '5 people', value: 5 },
  { label: '15 people', value: 15 },
];
const VALID: { label: string; value: number | null }[] = [
  { label: 'No expiry', value: null },
  { label: '7 days', value: 7 },
  { label: '30 days', value: 30 },
];

function day(iso: string) {
  return formatMonthDay(iso.slice(0, 10));
}

function Chips<T>({
  options,
  value,
  onChange,
  label,
}: {
  options: { label: string; value: T }[];
  value: T;
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <View style={styles.chips} accessibilityRole="radiogroup" accessibilityLabel={label}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable
            key={o.label}
            accessibilityRole="radio"
            accessibilityState={{ checked: on }}
            aria-checked={on}
            onPress={() => onChange(o.value)}
            style={[styles.chip, { backgroundColor: on ? c.accent : c.background }]}
          >
            <Text style={[type.bodyStrong, { color: on ? c.onAccent : c.ink }]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export default function Invites() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { session } = useAuth();
  const myId = session?.user.id ?? '';

  const [admin, setAdmin] = useState<boolean | null>(null);
  const [invites, setInvites] = useState<Invite[] | null>(null);
  const [label, setLabel] = useState('');
  const [maxUses, setMaxUses] = useState<number | null>(null);
  const [days, setDays] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    fetchInvites()
      .then(setInvites)
      .catch((e) => setError(e instanceof Error ? e.message : 'Could not load invites'));
  }, []);

  useEffect(() => {
    if (!myId) return;
    fetchProfile(myId)
      .then((p) => {
        setAdmin(!!p?.is_admin);
        if (p?.is_admin) load();
      })
      .catch(() => setAdmin(false));
  }, [myId, load]);

  async function create() {
    setBusy(true);
    setError(null);
    try {
      const inv = await createInvite(myId, { label, maxUses, days });
      setInvites((prev) => [inv, ...(prev ?? [])]);
      setLabel('');
      setNotice(`New code ${inv.code} is ready to share`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not create the invite');
    } finally {
      setBusy(false);
    }
  }

  async function revoke(i: Invite) {
    const ok = await confirm(
      `Turn off ${i.code}?`,
      'Nobody new can join with it. People who already joined keep their accounts.',
      'Turn off',
      true,
    );
    if (!ok) return;
    try {
      await revokeInvite(i.code);
      setInvites((prev) => prev?.map((x) => (x.code === i.code ? { ...x, revoked_at: new Date().toISOString() } : x)) ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not turn it off');
    }
  }

  async function copy(code: string) {
    await Clipboard.setStringAsync(code);
    setNotice(`Copied ${code}`);
  }

  function email(code: string) {
    const subject = encodeURIComponent('Join our Epic Asia trip app');
    const body = encodeURIComponent(inviteMessage(code));
    Linking.openURL(`mailto:?subject=${subject}&body=${body}`).catch(() => setError('No email app is set up.'));
  }

  const active = (invites ?? []).filter((i) => isActive(i));
  const past = (invites ?? []).filter((i) => !isActive(i));

  return (
    <View style={[styles.screen, { backgroundColor: c.background }]}>
      <SkyBackdrop />
      <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
        <CircleButton icon="chevron-back" label="Back" onPress={() => router.back()} />
        <Text style={styles.headerTitle} accessibilityRole="header">
          Invites
        </Text>
        <View style={styles.spacer} />
      </View>

      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 40 }]} keyboardShouldPersistTaps="handled">
        {admin === false ? (
          <Text style={[type.body, { color: c.inkSecondary }]}>Only trip organizers can create invites.</Text>
        ) : admin === null ? (
          <Bone width="100%" height={220} radius={22} />
        ) : (
          <>
            <View style={[styles.card, { backgroundColor: c.card }]}>
              <Text style={styles.cardTitle}>New invite</Text>
              <FormField label="Who it's for (optional)" value={label} onChangeText={setLabel} placeholder="The Allen family" maxLength={80} />
              <Text style={[type.caption, styles.chipLabel]}>How many people can use it</Text>
              <Chips options={USES} value={maxUses} onChange={setMaxUses} label="How many people can use it" />
              <Text style={[type.caption, styles.chipLabel]}>Valid for</Text>
              <Chips options={VALID} value={days} onChange={setDays} label="Valid for" />
              <Pressable
                accessibilityRole="button"
                disabled={busy}
                onPress={create}
                testID="create-invite"
                style={({ pressed }) => [styles.primary, { backgroundColor: busy ? c.accentDisabled : pressed ? c.accentPressed : c.accent }]}
              >
                <Text style={[type.button, { color: c.onAccent }]}>{busy ? 'Creating…' : 'Create invite code'}</Text>
              </Pressable>
            </View>

            {notice ? (
              <Text style={[type.bodyStrong, styles.center, { color: c.success }]} accessibilityLiveRegion="polite">
                {notice}
              </Text>
            ) : null}
            {error ? (
              <Text style={[type.body, styles.center, { color: c.danger }]} accessibilityLiveRegion="assertive">
                {error}
              </Text>
            ) : null}

            {invites === null ? <Bone width="100%" height={300} radius={22} /> : null}

            {active.map((i) => (
              <View key={i.code} style={[styles.card, { backgroundColor: c.card }]} testID="invite-card">
                <View style={styles.codeRow}>
                  <View style={styles.flex}>
                    <Text style={styles.code} selectable accessibilityLabel={`Code ${i.code.split('').join(' ')}`}>
                      {i.code}
                    </Text>
                    {i.label ? <Text style={[type.bodyStrong, { color: c.ink }]}>{i.label}</Text> : null}
                    <Text style={[type.body, { color: c.inkSecondary }]}>
                      {i.max_uses ? `Used ${i.uses} of ${i.max_uses}` : `Used ${i.uses} time${i.uses === 1 ? '' : 's'}`}
                      {i.expires_at ? ` · until ${day(i.expires_at)}` : ''}
                    </Text>
                  </View>
                </View>
                <View style={styles.qr}>
                  <QrCode value={inviteLink(i.code)} size={184} label={`QR code that opens registration with ${i.code}`} />
                  <Text style={[type.body, styles.center, { color: c.inkSecondary }]}>Scan with a phone camera to join</Text>
                </View>
                <View style={styles.actions}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Share ${i.code}`}
                    onPress={() => Share.share({ message: inviteMessage(i.code) })}
                    style={({ pressed }) => [styles.action, { backgroundColor: pressed ? c.accentPressed : c.accent }]}
                  >
                    <Ionicons name="share-outline" size={19} color={c.onAccent} />
                    <Text style={[type.bodyStrong, { color: c.onAccent }]}>Share</Text>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Email ${i.code}`}
                    onPress={() => email(i.code)}
                    style={({ pressed }) => [styles.action, styles.actionLight, { backgroundColor: pressed ? c.surfacePressed : c.card }]}
                  >
                    <Ionicons name="mail-outline" size={19} color={c.highlight} />
                    <Text style={[type.bodyStrong, { color: c.highlight }]}>Email</Text>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Copy ${i.code}`}
                    onPress={() => copy(i.code)}
                    style={({ pressed }) => [styles.action, styles.actionLight, { backgroundColor: pressed ? c.surfacePressed : c.card }]}
                  >
                    <Ionicons name="copy-outline" size={19} color={c.highlight} />
                    <Text style={[type.bodyStrong, { color: c.highlight }]}>Copy</Text>
                  </Pressable>
                </View>
                <Pressable accessibilityRole="button" accessibilityLabel={`Turn off ${i.code}`} onPress={() => revoke(i)} style={styles.revoke}>
                  <Text style={[type.bodyStrong, { color: c.danger }]}>Turn off this code</Text>
                </Pressable>
              </View>
            ))}

            {invites && active.length === 0 ? (
              <Text style={[type.body, styles.center, { color: c.inkSecondary }]}>
                No active codes. Create one above to invite travelers.
              </Text>
            ) : null}

            {past.length ? (
              <View style={styles.past}>
                <Text style={styles.section} accessibilityRole="header">
                  No longer active
                </Text>
                {past.map((i) => (
                  <Text key={i.code} style={[type.body, { color: c.inkSecondary }]}>
                    {i.code}
                    {i.label ? ` · ${i.label}` : ''} · used {i.uses}
                    {i.revoked_at ? ' · turned off' : i.max_uses !== null && i.uses >= i.max_uses ? ' · used up' : ' · expired'}
                  </Text>
                ))}
              </View>
            ) : null}
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  flex: { flex: 1 },
  center: { textAlign: 'center' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 12,
  },
  headerTitle: { fontFamily: fontFamily.display, fontSize: 22, letterSpacing: -0.2, color: c.ink },
  spacer: { width: 44 },
  content: { paddingHorizontal: 20, gap: 14 },
  card: { borderRadius: 22, padding: 18, gap: 10, boxShadow: shadow.card },
  cardTitle: { fontFamily: fontFamily.display, fontSize: 22, lineHeight: 28, color: c.ink, marginBottom: 4 },
  chipLabel: { color: c.inkSecondary, marginTop: -6 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 6 },
  chip: { height: 44, paddingHorizontal: 16, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  primary: { height: 54, borderRadius: 27, alignItems: 'center', justifyContent: 'center', marginTop: 4 },
  codeRow: { flexDirection: 'row', alignItems: 'flex-start' },
  code: { fontFamily: fontFamily.monoSemiBold, fontSize: 30, lineHeight: 38, letterSpacing: 2, color: c.ink },
  qr: { alignItems: 'center', gap: 6, paddingVertical: 6 },
  actions: { flexDirection: 'row', gap: 8 },
  action: {
    flex: 1,
    height: 48,
    borderRadius: 24,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  actionLight: { borderWidth: 1, borderColor: c.border },
  revoke: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  past: { gap: 6, marginTop: 6 },
  section: { fontFamily: fontFamily.display, fontSize: 20, lineHeight: 26, color: c.ink },
});
