import { useRouter } from 'expo-router';
import { useState } from 'react';
import FormButton from '../../../components/form/FormButton';
import FormField from '../../../components/form/FormField';
import FormScreen from '../../../components/form/FormScreen';
import { useAuth } from '../../../lib/AuthProvider';
import { createItineraryItem } from '../../../lib/itinerary';

// "9:00 AM" / "9am" / "21:00" -> 24hr "HH:MM", or null if unparseable.
function parseTimeInput(raw: string): { hour: number; minute: number } | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const match = trimmed.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/i);
  if (!match) return null;

  let hour = Number(match[1]);
  const minute = match[2] ? Number(match[2]) : 0;
  const meridiem = match[3]?.toLowerCase();

  if (hour > 23 || minute > 59) return null;
  if (meridiem === 'pm' && hour < 12) hour += 12;
  if (meridiem === 'am' && hour === 12) hour = 0;

  return { hour, minute };
}

function isValidDay(day: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(day) && !Number.isNaN(new Date(day).getTime());
}

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
