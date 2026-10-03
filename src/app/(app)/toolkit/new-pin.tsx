import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import FormButton from '../../../components/form/FormButton';
import FormField from '../../../components/form/FormField';
import FormScreen from '../../../components/form/FormScreen';
import { useAuth } from '../../../lib/AuthProvider';
import { todayDay } from '../../../lib/dates';
import { addPin, currentPosition, PIN_CATEGORIES, type PinCategory } from '../../../lib/pins';
import { stopForDay } from '../../../lib/places';
import { CITIES, type CityKey } from '../../../lib/weather';
import { shadow } from '../../../theme/colors';
import { fontFamily, type } from '../../../theme/typography';
import { useTheme } from '../../../theme/useTheme';

// Add a map pin for the group: name, the address as written locally (to
// show a taxi driver), city, kind of place, a note, and optionally the
// exact spot from the phone's location.

export default function NewPin() {
  const router = useRouter();
  const colors = useTheme();
  const { session } = useAuth();
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [note, setNote] = useState('');
  const [city, setCity] = useState<CityKey | null>(() => (stopForDay(todayDay())?.key as CityKey | undefined) ?? null);
  const [category, setCategory] = useState<PinCategory>('hotel');
  const [spot, setSpot] = useState<{ lat: number; lng: number; accuracy: number | null } | null>(null);
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function useHere() {
    setError(null);
    setLocating(true);
    try {
      const pos = await currentPosition();
      if (!pos) setError('Location access is off. Turn it on for Epic Asia in Settings to save the exact spot.');
      else setSpot(pos);
    } catch {
      setError('Couldn’t get your location. Try again outside, or just type the address.');
    } finally {
      setLocating(false);
    }
  }

  async function save() {
    setError(null);
    if (!session) return setError('You must be signed in.');
    if (!name.trim()) return setError('Give the place a name.');
    if (!address.trim() && !spot) return setError('Add an address or use where you are, so Maps can find it.');
    setSaving(true);
    try {
      await addPin(session.user.id, {
        name,
        address,
        note,
        category,
        city,
        lat: spot?.lat ?? null,
        lng: spot?.lng ?? null,
      });
      router.back();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save the pin');
    } finally {
      setSaving(false);
    }
  }

  return (
    <FormScreen title="Add a pin" error={error}>
      <FormField label="Name" value={name} onChangeText={setName} placeholder="e.g. Hotel Gracery Shinjuku" autoCapitalize="words" maxLength={80} />
      <FormField
        label="Address (as written locally, to show a driver)"
        value={address}
        onChangeText={setAddress}
        placeholder="e.g. 東京都新宿区歌舞伎町1-19-1"
        multiline
        maxLength={300}
        style={styles.multiline}
      />

      <Pressable
        accessibilityRole="button"
        testID="use-here"
        onPress={useHere}
        disabled={locating}
        style={({ pressed }) => [styles.here, { backgroundColor: colors.card, opacity: pressed || locating ? 0.7 : 1 }]}
      >
        <Ionicons name={spot ? 'checkmark-circle' : 'locate-outline'} size={22} color={spot ? colors.success : colors.highlight} />
        <Text style={[type.bodyStrong, styles.flex, { color: colors.ink }]}>
          {locating
            ? 'Finding you…'
            : spot
              ? `Exact spot saved${spot.accuracy ? ` (within ${Math.round(spot.accuracy)} m)` : ''}`
              : 'Use where I am'}
        </Text>
      </Pressable>

      <Text style={[styles.label, { color: colors.inkSecondary }]}>City</Text>
      <View style={styles.chips} accessibilityRole="radiogroup" accessibilityLabel="City">
        {[...CITIES.map((ci) => ({ key: ci.key as CityKey | null, label: ci.name })), { key: null, label: 'Anywhere' }].map((o) => {
          const on = o.key === city;
          return (
            <Chip key={o.label} label={o.label} on={on} onPress={() => setCity(o.key)} />
          );
        })}
      </View>

      <Text style={[styles.label, { color: colors.inkSecondary }]}>Kind of place</Text>
      <View style={styles.chips} accessibilityRole="radiogroup" accessibilityLabel="Kind of place">
        {PIN_CATEGORIES.map((k) => (
          <Chip key={k.key} label={k.label} icon={k.icon} on={k.key === category} onPress={() => setCategory(k.key)} />
        ))}
      </View>

      <FormField label="Note (optional)" value={note} onChangeText={setNote} placeholder="e.g. Meet in the lobby at 8" maxLength={500} />
      <FormButton label="Save" onPress={save} loading={saving} />
      <FormButton label="Cancel" variant="text" onPress={() => router.back()} />
    </FormScreen>
  );
}

function Chip({ label, icon, on, onPress }: { label: string; icon?: string; on: boolean; onPress: () => void }) {
  const colors = useTheme();
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked: on }}
      aria-checked={on}
      onPress={onPress}
      style={[styles.chip, { backgroundColor: on ? colors.accent : colors.card, borderColor: on ? colors.accent : colors.border }]}
    >
      {icon ? <Ionicons name={icon as keyof typeof Ionicons.glyphMap} size={16} color={on ? colors.onAccent : colors.inkSecondary} /> : null}
      <Text style={[type.bodyStrong, { color: on ? colors.onAccent : colors.ink }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  multiline: { minHeight: 76, textAlignVertical: 'top', paddingTop: 14 },
  here: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 54,
    borderRadius: 18,
    paddingHorizontal: 16,
    marginBottom: 14,
    boxShadow: shadow.card,
  },
  label: { fontFamily: fontFamily.bodyMedium, fontSize: 12.5, letterSpacing: 0.2, marginBottom: 8 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 44, paddingHorizontal: 14, borderRadius: 22, borderWidth: 1 },
});
