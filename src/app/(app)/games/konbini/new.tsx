import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import FormButton from '../../../../components/form/FormButton';
import FormField from '../../../../components/form/FormField';
import FormScreen from '../../../../components/form/FormScreen';
import Stars from '../../../../components/games/Stars';
import { useAuth } from '../../../../lib/AuthProvider';
import { todayDay } from '../../../../lib/dates';
import { addReview } from '../../../../lib/games';
import { MAX_VIDEO_BYTES, type PickedPhoto } from '../../../../lib/photos';
import { stopForDay } from '../../../../lib/places';
import { CITIES, type CityKey } from '../../../../lib/weather';
import { shadow } from '../../../../theme/colors';
import { fontFamily, type } from '../../../../theme/typography';
import { useTheme } from '../../../../theme/useTheme';

// Post a Konbini Review: your reaction video (film it now or pick one),
// what the snack was, a 1–5 rating, a one-line verdict and the city. The
// video goes to the game only, not to Photos.

const RATINGS = [
  '1 star, never again',
  '2 stars, not for me',
  '3 stars, it’s fine',
  '4 stars, pretty good',
  '5 stars, amazing',
];
const VERDICT = ['', 'Never again', 'Not for me', 'It’s fine', 'Pretty good', 'Amazing'];

export default function NewReview() {
  const router = useRouter();
  const colors = useTheme();
  const { session } = useAuth();
  const [video, setVideo] = useState<PickedPhoto | null>(null);
  const [snack, setSnack] = useState('');
  const [rating, setRating] = useState(0);
  const [caption, setCaption] = useState('');
  const [city, setCity] = useState<CityKey | null>(() => (stopForDay(todayDay())?.key as CityKey | undefined) ?? null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function pick(fromCamera: boolean) {
    setError(null);
    const opts: ImagePicker.ImagePickerOptions = { mediaTypes: ['videos'], quality: 0.9, videoMaxDuration: 60 };
    const res = fromCamera
      ? await ImagePicker.launchCameraAsync(opts)
      : await ImagePicker.launchImageLibraryAsync(opts);
    const a = res.canceled ? null : res.assets[0];
    if (!a) return;
    if ((a.fileSize ?? a.file?.size ?? 0) > MAX_VIDEO_BYTES)
      return setError('That video is over 50 MB. Trim it and try again.');
    setVideo({
      uri: a.uri,
      width: a.width,
      height: a.height,
      mimeType: a.mimeType ?? 'video/mp4',
      file: a.file ?? null,
      // The web picker gives seconds (Infinity for some recorded clips).
      durationMs: Number.isFinite(a.duration) ? Math.round((a.duration ?? 0) * 1000) : 0,
    });
  }

  async function post() {
    setError(null);
    if (!session) return setError('You must be signed in.');
    if (!video) return setError('Add your reaction video first.');
    if (!snack.trim()) return setError('What was the snack?');
    if (!rating) return setError('Give it a rating from 1 to 5.');
    setSaving(true);
    try {
      await addReview(session.user.id, video, { snack, rating, caption, city });
      router.back();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not post your review');
    } finally {
      setSaving(false);
    }
  }

  return (
    <FormScreen title="New review" error={error}>
      {video ? (
        <View style={[styles.preview, { backgroundColor: colors.card }]} testID="review-preview">
          <video
            src={video.uri}
            controls
            playsInline
            aria-label="Your reaction video"
            style={{ width: '100%', maxHeight: 360, background: colors.mediaBackground, display: 'block' }}
          />
          <Pressable accessibilityRole="button" onPress={() => setVideo(null)} style={styles.change}>
            <Text style={[type.bodyStrong, { color: colors.highlight }]}>Choose a different video</Text>
          </Pressable>
        </View>
      ) : (
        <View style={styles.sources}>
          <Source icon="videocam-outline" label="Film your reaction" onPress={() => pick(true)} />
          <Source icon="film-outline" label="Choose a video" onPress={() => pick(false)} testID="pick-video" />
        </View>
      )}

      <FormField
        label="What was it?"
        value={snack}
        onChangeText={setSnack}
        placeholder="e.g. Wasabi Kit Kat"
        autoCapitalize="words"
        maxLength={80}
        testID="snack-name"
      />

      <Text style={[styles.label, { color: colors.inkSecondary }]}>Your rating</Text>
      <View style={styles.rating}>
        <Stars value={rating} size={34} onChange={setRating} labels={RATINGS} />
        {rating ? <Text style={[type.bodyStrong, { color: colors.ink }]}>{VERDICT[rating]}</Text> : null}
      </View>

      <FormField
        label="Your verdict (optional)"
        value={caption}
        onChangeText={setCaption}
        placeholder="e.g. Tastes like a spicy forest"
        autoCapitalize="sentences"
        maxLength={200}
      />

      <Text style={[styles.label, { color: colors.inkSecondary }]}>Where</Text>
      <View style={styles.chips} accessibilityRole="radiogroup" accessibilityLabel="Where">
        {[
          ...CITIES.map((c) => ({ key: c.key as CityKey | null, label: c.name })),
          { key: null, label: 'Somewhere else' },
        ].map((o) => {
          const on = o.key === city;
          return (
            <Pressable
              key={o.label}
              accessibilityRole="radio"
              accessibilityState={{ checked: on }}
              aria-checked={on}
              onPress={() => setCity(o.key)}
              style={[
                styles.chip,
                { backgroundColor: on ? colors.accent : colors.card, borderColor: on ? colors.accent : colors.border },
              ]}
            >
              <Text style={[type.bodyStrong, { color: on ? colors.onAccent : colors.ink }]}>{o.label}</Text>
            </Pressable>
          );
        })}
      </View>

      <FormButton label="Post it" onPress={post} loading={saving} disabled={!video} />
      <FormButton label="Cancel" variant="text" onPress={() => router.back()} />
    </FormScreen>
  );
}

function Source({
  icon,
  label,
  onPress,
  testID,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  testID?: string;
}) {
  const colors = useTheme();
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.source, { backgroundColor: colors.card, opacity: pressed ? 0.8 : 1 }]}
    >
      <Ionicons name={icon} size={28} color={colors.highlight} />
      <Text style={[type.bodyStrong, styles.center, { color: colors.ink }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  center: { textAlign: 'center' },
  sources: { flexDirection: 'row', gap: 10, marginBottom: 16 },
  source: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    minHeight: 120,
    paddingHorizontal: 8,
    borderRadius: 20,
    boxShadow: shadow.card,
  },
  preview: { borderRadius: 20, overflow: 'hidden', marginBottom: 16 },
  change: { minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  label: { fontFamily: fontFamily.bodyMedium, fontSize: 12.5, letterSpacing: 0.2, marginBottom: 4 },
  rating: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 16, flexWrap: 'wrap' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  chip: {
    minHeight: 44,
    paddingHorizontal: 14,
    borderRadius: 22,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
