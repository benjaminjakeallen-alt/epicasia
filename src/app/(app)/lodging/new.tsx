import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import FormButton from '../../../components/form/FormButton';
import FormField from '../../../components/form/FormField';
import FormScreen from '../../../components/form/FormScreen';
import { useAuth } from '../../../lib/AuthProvider';
import { isValidDay } from '../../../lib/dates';
import { createStay } from '../../../lib/lodging';

export default function NewStay() {
  const router = useRouter();
  const { session } = useAuth();
  // Pre-filled when opened from a leg's "Add a stay in …" card.
  const params = useLocalSearchParams<{ city?: string; checkIn?: string; checkOut?: string }>();

  const [name, setName] = useState('');
  const [city, setCity] = useState(params.city ?? '');
  const [checkIn, setCheckIn] = useState(params.checkIn ?? '');
  const [checkOut, setCheckOut] = useState(params.checkOut ?? '');
  const [address, setAddress] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    setError(null);

    if (!name.trim()) {
      setError('Name is required.');
      return;
    }
    const inDay = checkIn.trim();
    const outDay = checkOut.trim();
    if (!isValidDay(inDay) || !isValidDay(outDay)) {
      setError('Check-in and check-out must be real dates, e.g. 2027-06-06.');
      return;
    }
    if (outDay <= inDay) {
      setError('Check-out must be after check-in.');
      return;
    }
    if (!session) {
      setError('You must be signed in.');
      return;
    }

    setSaving(true);
    try {
      await createStay(
        {
          name: name.trim(),
          city: city.trim() || null,
          address: address.trim() || null,
          check_in: inDay,
          check_out: outDay,
          confirmation_code: confirmation.trim() || null,
          notes: notes.trim() || null,
        },
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
    <FormScreen title="Add a Stay" error={error}>
      <FormField label="Name" value={name} onChangeText={setName} placeholder="Hotel Gracery Shinjuku" autoCapitalize="words" />
      <FormField label="City" value={city} onChangeText={setCity} placeholder="Tokyo" autoCapitalize="words" />
      <FormField label="Check-in" value={checkIn} onChangeText={setCheckIn} placeholder="2027-06-06" />
      <FormField label="Check-out" value={checkOut} onChangeText={setCheckOut} placeholder="2027-06-09" />
      <FormField
        label="Address (optional)"
        value={address}
        onChangeText={setAddress}
        placeholder="1-19-1 Kabukicho, Shinjuku, Tokyo"
        autoCapitalize="words"
      />
      <FormField
        label="Confirmation code (optional)"
        value={confirmation}
        onChangeText={setConfirmation}
        placeholder="HX4821"
        autoCapitalize="characters"
      />
      <FormField
        label="Notes (optional)"
        value={notes}
        onChangeText={setNotes}
        placeholder="Two rooms, breakfast included."
        autoCapitalize="sentences"
        multiline
        numberOfLines={4}
        style={{ height: 100, paddingTop: 12, textAlignVertical: 'top' }}
      />
      <FormButton label="Save" onPress={handleSave} loading={saving} />
      <FormButton label="Cancel" variant="text" onPress={() => router.back()} />
    </FormScreen>
  );
}
