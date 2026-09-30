import { useRouter } from 'expo-router';
import { useState } from 'react';
import FormButton from '../../../components/form/FormButton';
import FormField from '../../../components/form/FormField';
import FormScreen from '../../../components/form/FormScreen';
import { useAuth } from '../../../lib/AuthProvider';
import { isValidDay, parseTimeInput } from '../../../lib/dates';
import { createItineraryItem } from '../../../lib/itinerary';

export default function NewItineraryItem() {
  const router = useRouter();
  const { session } = useAuth();

  const [day, setDay] = useState('');
  const [title, setTitle] = useState('');
  const [city, setCity] = useState('');
  const [time, setTime] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    setError(null);

    if (!isValidDay(day)) {
      setError('Day must be a real date, e.g. 2027-06-06.');
      return;
    }
    if (!title.trim()) {
      setError('Title is required.');
      return;
    }

    let startTime: string | null = null;
    if (time.trim()) {
      const parsed = parseTimeInput(time);
      if (!parsed) {
        setError('Time must look like "9:00 AM" or "21:00".');
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
      setError(e instanceof Error ? e.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  }

  return (
    <FormScreen title="Add to Itinerary" error={error}>
      <FormField label="Day" value={day} onChangeText={setDay} placeholder="2027-06-06" />
      <FormField label="Title" value={title} onChangeText={setTitle} placeholder="Tokyo Disneyland" />
      <FormField label="City" value={city} onChangeText={setCity} placeholder="Tokyo" />
      <FormField label="Time (optional)" value={time} onChangeText={setTime} placeholder="9:00 AM" />
      <FormField
        label="Description (optional)"
        value={description}
        onChangeText={setDescription}
        placeholder="Full park day."
        multiline
        numberOfLines={4}
        style={{ height: 100, paddingTop: 12, textAlignVertical: 'top' }}
      />
      <FormButton label="Save" onPress={handleSave} loading={saving} />
      <FormButton label="Cancel" variant="text" onPress={() => router.back()} />
    </FormScreen>
  );
}
