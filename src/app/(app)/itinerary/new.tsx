import { useRouter } from 'expo-router';
import { useState } from 'react';
import FormButton from '../../../components/form/FormButton';
import FormField from '../../../components/form/FormField';
import FormScreen from '../../../components/form/FormScreen';
import PickerField from '../../../components/form/PickerField';
import { useAuth } from '../../../lib/AuthProvider';
import { isValidDay, parseTimeInput, todayDay } from '../../../lib/dates';
import { createItineraryItem } from '../../../lib/itinerary';
import { STOPS, stopForDay } from '../../../lib/places';

// Starts on today during the trip, on the trip's first day before it.
const firstDay = () => (stopForDay(todayDay()) ? todayDay() : STOPS[0].from);

export default function NewItineraryItem() {
  const router = useRouter();
  const { session } = useAuth();

  const [day, setDay] = useState(firstDay);
  const [title, setTitle] = useState('');
  // The city follows the day's leg until you type your own.
  const [city, setCity] = useState(() => stopForDay(firstDay())?.city ?? '');
  const [cityEdited, setCityEdited] = useState(false);
  const [time, setTime] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    setError(null);

    if (!isValidDay(day)) {
      setError('Pick the day.');
      return;
    }
    if (!title.trim()) {
      setError('Give it a title.');
      return;
    }

    let startTime: string | null = null;
    if (time.trim()) {
      const parsed = parseTimeInput(time);
      if (!parsed) {
        setError('Pick the time again.');
        return;
      }
      const [y, m, d] = day.split('-').map(Number);
      startTime = new Date(y, m - 1, d, parsed.hour, parsed.minute).toISOString();
    }

    if (!session) {
      setError('You must be signed in.');
      return;
    }

    setSaving(true);
    try {
      await createItineraryItem(
        { day, title: title.trim(), city: city.trim(), description: description.trim(), start_time: startTime },
        session.user.id,
      );
      router.back();
    } catch (e) {
      setError(navigator.onLine === false ? 'You’re offline. Try again when you have signal.' : 'Couldn’t save that. Try again.');
      console.warn(e);
    } finally {
      setSaving(false);
    }
  }

  return (
    <FormScreen title="Add to Itinerary" error={error}>
      <FormField label="Title" value={title} onChangeText={setTitle} placeholder="Tokyo Disneyland" autoCapitalize="sentences" />
      <PickerField
        label="Day"
        kind="date"
        value={day}
        onChangeText={(d) => {
          setDay(d);
          const stop = stopForDay(d);
          if (!cityEdited && stop) setCity(stop.city);
        }}
        testID="itinerary-day"
      />
      <PickerField label="Time (optional)" kind="time" value={time} onChangeText={setTime} testID="itinerary-time" />
      <FormField
        label="City"
        value={city}
        onChangeText={(v) => {
          setCity(v);
          setCityEdited(true);
        }}
        placeholder="Tokyo"
        autoCapitalize="words"
      />
      <FormField
        label="Description (optional)"
        value={description}
        onChangeText={setDescription}
        placeholder="Full park day."
        multiline
        numberOfLines={4}
        autoCapitalize="sentences"
        style={{ height: 100, paddingTop: 12, textAlignVertical: 'top' }}
      />
      <FormButton label="Save" onPress={handleSave} loading={saving} />
      <FormButton label="Cancel" variant="text" onPress={() => router.back()} />
    </FormScreen>
  );
}
