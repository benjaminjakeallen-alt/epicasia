import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Avatar from '../../components/Avatar';
import NotificationsRow from '../../components/chat/NotificationsRow';
import YukiWakeRow from '../../components/yuki/YukiWakeRow';
import CircleButton from '../../components/CircleButton';
import FormButton from '../../components/form/FormButton';
import FormField from '../../components/form/FormField';
import { Bone } from '../../components/Skeleton';
import SkyBackdrop from '../../components/SkyBackdrop';
import { useAuth } from '../../lib/AuthProvider';
import { confirm } from '../../lib/confirm';
import { changePassword, fetchProfile, removeAvatar, setAvatar, updateDisplayName, type Profile } from '../../lib/profile';
import { clearLocalDocuments } from '../../lib/documents';
import { clearOfflineCopies } from '../../lib/offline';
import { unregisterPush } from '../../lib/push';
import { supabase } from '../../lib/supabase';
import { colors as c, shadow } from '../../theme/colors';
import { fontFamily, type } from '../../theme/typography';

const PHOTO = 128;

export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { session } = useAuth();
  const myId = session?.user.id ?? '';

  const [profile, setProfile] = useState<Profile | null>(null);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState<'photo' | 'name' | 'password' | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!myId) return;
    fetchProfile(myId)
      .then((p) => {
        setProfile(p);
        setName(p?.display_name ?? '');
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Could not load your profile'));
  }, [myId]);

  async function pick(fromCamera: boolean) {
    setError(null);
    setNotice(null);
    const opts: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.9 };
    const res = fromCamera ? await ImagePicker.launchCameraAsync(opts) : await ImagePicker.launchImageLibraryAsync(opts);
    if (res.canceled || !res.assets[0] || !profile) return;
    const a = res.assets[0];
    setBusy('photo');
    try {
      const path = await setAvatar(myId, { uri: a.uri, width: a.width, height: a.height, mimeType: a.mimeType }, profile.avatar_url);
      setProfile({ ...profile, avatar_url: path });
      setNotice('Photo updated');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not update your photo');
    } finally {
      setBusy(null);
    }
  }

  async function clearPhoto() {
    if (!profile?.avatar_url) return;
    if (!(await confirm('Remove your photo?', 'Your initials show instead.'))) return;
    setBusy('photo');
    try {
      await removeAvatar(myId, profile.avatar_url);
      setProfile({ ...profile, avatar_url: null });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not remove your photo');
    } finally {
      setBusy(null);
    }
  }

  async function saveName() {
    setError(null);
    setNotice(null);
    setBusy('name');
    try {
      await updateDisplayName(myId, name);
      setProfile((p) => (p ? { ...p, display_name: name.trim().replace(/\s+/g, ' ') } : p));
      setNotice('Name saved');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save your name');
    } finally {
      setBusy(null);
    }
  }

  async function savePassword() {
    setError(null);
    setNotice(null);
    setBusy('password');
    try {
      await changePassword(newPassword);
      setNewPassword('');
      setNotice('Password changed');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not change your password');
    } finally {
      setBusy(null);
    }
  }

  async function signOut() {
    if (!(await confirm('Sign out?', 'You can sign back in with your email and password.'))) return;
    await unregisterPush().catch(() => {});
    await clearOfflineCopies();
    await clearLocalDocuments();
    await supabase.auth.signOut();
  }

  const nameChanged = !!profile && name.trim().replace(/\s+/g, ' ') !== profile.display_name;

  return (
    <View
      style={[styles.screen, { backgroundColor: c.background }]}
    >
      <SkyBackdrop />
      <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
        <CircleButton icon="chevron-back" label="Back" onPress={() => router.back()} />
        <Text style={styles.headerTitle} accessibilityRole="header">
          Profile
        </Text>
        <View style={styles.spacer} />
      </View>

      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 40 }]} keyboardShouldPersistTaps="handled">
        <View style={styles.photoBlock}>
          {profile ? (
            <Avatar
              name={profile.display_name}
              path={profile.avatar_url}
              color={c.accent}
              size={PHOTO}
              style={styles.photoShadow}
            />
          ) : (
            <Bone width={PHOTO} height={PHOTO} radius={PHOTO / 2} />
          )}
          <View style={styles.photoActions}>
            <Pressable
              accessibilityRole="button"
              disabled={!profile || busy === 'photo'}
              onPress={() => pick(false)}
              testID="avatar-library"
              style={({ pressed }) => [styles.pill, { backgroundColor: pressed ? c.surfacePressed : c.card }]}
            >
              <Ionicons name="images-outline" size={18} color={c.highlight} />
              <Text style={[type.bodyStrong, { color: c.highlight }]}>
                {profile?.avatar_url ? 'Change photo' : 'Add a photo'}
              </Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Take a photo"
              disabled={!profile || busy === 'photo'}
              onPress={() => pick(true)}
              style={({ pressed }) => [styles.pillIcon, { backgroundColor: pressed ? c.surfacePressed : c.card }]}
            >
              <Ionicons name="camera-outline" size={20} color={c.highlight} />
            </Pressable>
            {profile?.avatar_url ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Remove photo"
                disabled={busy === 'photo'}
                onPress={clearPhoto}
                style={({ pressed }) => [styles.pillIcon, { backgroundColor: pressed ? c.surfacePressed : c.card }]}
              >
                <Ionicons name="trash-outline" size={19} color={c.inkSecondary} />
              </Pressable>
            ) : null}
          </View>
          {busy === 'photo' ? (
            <Text style={[type.bodyStrong, { color: c.highlight }]} accessibilityLiveRegion="polite">
              Uploading…
            </Text>
          ) : null}
        </View>

        <FormField
          label="Your name"
          value={name}
          onChangeText={setName}
          autoCapitalize="words"
          autoCorrect={false}
          textContentType="name"
          autoComplete="name"
          maxLength={60}
          testID="profile-name"
        />
        {nameChanged ? <FormButton label="Save name" onPress={saveName} loading={busy === 'name'} /> : null}

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

        <View style={[styles.card, { backgroundColor: c.card }]}>
          <Text style={[type.caption, { color: c.inkSecondary }]}>Email</Text>
          <Text style={[type.body, { color: c.ink }]} selectable>
            {session?.user.email}
          </Text>
        </View>


        <FormField
          label="New password"
          value={newPassword}
          onChangeText={setNewPassword}
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
          textContentType="newPassword"
          autoComplete="new-password"
          testID="new-password"
        />
        {newPassword ? (
          <FormButton label="Change password" onPress={savePassword} loading={busy === 'password'} />
        ) : null}

        {profile?.is_admin ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push('/(app)/admin')}
            testID="open-admin"
            style={({ pressed }) => [styles.linkRow, { backgroundColor: pressed ? c.surfacePressed : c.card }]}
          >
            <Ionicons name="shield-checkmark-outline" size={22} color={c.highlight} />
            <Text style={[type.bodyStrong, styles.flex, { color: c.ink }]}>Admin</Text>
            <Ionicons name="chevron-forward" size={20} color={c.inkSecondary} />
          </Pressable>
        ) : null}

        <NotificationsRow />

        <YukiWakeRow />

        <Pressable
          accessibilityRole="button"
          onPress={() => router.push('/(app)/accessibility')}
          testID="open-accessibility"
          style={({ pressed }) => [styles.linkRow, { backgroundColor: pressed ? c.surfacePressed : c.card }]}
        >
          <Ionicons name="accessibility-outline" size={22} color={c.highlight} />
          <Text style={[type.bodyStrong, styles.flex, { color: c.ink }]}>Accessibility</Text>
          <Ionicons name="chevron-forward" size={20} color={c.inkSecondary} />
        </Pressable>

        <Pressable
          accessibilityRole="button"
          onPress={signOut}
          testID="sign-out"
          style={({ pressed }) => [styles.signOut, { backgroundColor: pressed ? c.dangerSoft : c.card }]}
        >
          <Ionicons name="log-out-outline" size={20} color={c.danger} />
          <Text style={[type.bodyStrong, { color: c.danger }]}>Sign out</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
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
  photoBlock: { alignItems: 'center', gap: 14, marginVertical: 8 },
  photoShadow: { boxShadow: shadow.float },
  photoActions: { flexDirection: 'row', gap: 10 },
  pill: {
    height: 44,
    paddingHorizontal: 18,
    borderRadius: 22,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    boxShadow: shadow.card,
  },
  pillIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: shadow.card,
  },
  card: { borderRadius: 18, padding: 16, gap: 4, boxShadow: shadow.card },
  flex: { flex: 1 },
  linkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 60,
    borderRadius: 18,
    paddingHorizontal: 16,
    boxShadow: shadow.card,
  },
  signOut: {
    height: 54,
    borderRadius: 27,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 8,
    boxShadow: shadow.card,
  },
});
