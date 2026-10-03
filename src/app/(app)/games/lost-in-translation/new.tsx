import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import FormButton from '../../../../components/form/FormButton';
import FormField from '../../../../components/form/FormField';
import FormScreen from '../../../../components/form/FormScreen';
import { useAuth } from '../../../../lib/AuthProvider';
import { todayDay } from '../../../../lib/dates';
import { addEntry } from '../../../../lib/games';
import type { PickedPhoto } from '../../../../lib/photos';
import { stopForDay } from '../../../../lib/places';
import { CITIES, type CityKey } from '../../../../lib/weather';
import { shadow } from '../../../../theme/colors';
import { fontFamily, type } from '../../../../theme/typography';
import { useTheme } from '../../../../theme/useTheme';

// Post a find to Lost in Translation: a photo (library or camera), what it
// says, and the city. The photo goes to the game only, not to Photos.

export default function NewFind() {
  const router = useRouter();
  const colors = useTheme();
  const { session } = useAuth();
  const [photo, setPhoto] = useState<PickedPhoto | null>(null);
  const [caption, setCaption] = useState('');
  const [city, setCity] = useState<CityKey | null>(() => (stopForDay(todayDay())?.key as CityKey | undefined) ?? null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function pick(fromCamera: boolean) {
    setError(null);
    const opts: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 0.9 };
    const res = fromCamera
      ? await ImagePicker.launchCameraAsync(opts)
      : await ImagePicker.launchImageLibraryAsync(opts);
    const a = res.canceled ? null : res.assets[0];
    if (a) setPhoto({ uri: a.uri, width: a.width, height: a.height, mimeType: a.mimeType });
  }

  async function post() {
    setError(null);
    if (!session) return setError('You must be signed in.');
    if (!photo) return setError('Add a photo of your find first.');
    setSaving(true);
    try {
      await addEntry(session.user.id, 'lost_in_translation', photo, caption, city);
      router.back();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not post your find');
    } finally {
      setSaving(false);
    }
  }

  return (
    <FormScreen title="New find" error={error}>
      {photo ? (
        <View style={[styles.preview, { backgroundColor: colors.card }]} testID="find-preview">
          <Image
            source={{ uri: photo.uri }}
            style={[
              styles.previewImage,
              {
                aspectRatio:
                  photo.width && photo.height ? Math.min(1.6, Math.max(0.62, photo.width / photo.height)) : 4 / 3,
              },
            ]}
            contentFit="cover"
            accessibilityLabel="Your photo"
          />
          <Pressable accessibilityRole="button" onPress={() => setPhoto(null)} style={styles.change}>
            <Text style={[type.bodyStrong, { color: colors.highlight }]}>Choose a different photo</Text>
          </Pressable>
        </View>
      ) : (
        <View style={styles.sources}>
          <Source icon="images-outline" label="Choose a photo" onPress={() => pick(false)} testID="pick-photo" />
          <Source icon="camera-outline" label="Take a photo" onPress={() => pick(true)} />
        </View>
      )}

      <FormField
        label="What does it say? (optional)"
        value={caption}
        onChangeText={setCaption}
        placeholder="e.g. Please do not to touch the fish"
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

      <FormButton label="Post it" onPress={post} loading={saving} disabled={!photo} />
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
      <Text style={[type.bodyStrong, { color: colors.ink }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  sources: { flexDirection: 'row', gap: 10, marginBottom: 16 },
  source: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    minHeight: 120,
    borderRadius: 20,
    boxShadow: shadow.card,
  },
  preview: { borderRadius: 20, overflow: 'hidden', marginBottom: 16 },
  previewImage: { width: '100%' },
  change: { minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  label: { fontFamily: fontFamily.bodyMedium, fontSize: 12.5, letterSpacing: 0.2, marginBottom: 8 },
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
