import { useRouter } from 'expo-router';
import { useState } from 'react';
import FormButton from '../../../components/form/FormButton';
import FormField from '../../../components/form/FormField';
import FormScreen from '../../../components/form/FormScreen';
import PickerField from '../../../components/form/PickerField';
import { useAuth } from '../../../lib/AuthProvider';
import { addDays, isValidDay, parseTimeInput, wallClockISO } from '../../../lib/dates';
import { createFlight } from '../../../lib/flights';

const IATA = /^[A-Z]{3}$/;

export default function NewFlight() {
  const router = useRouter();
  const { session } = useAuth();

  const [airline, setAirline] = useState('');
  const [flightNumber, setFlightNumber] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [day, setDay] = useState('');
  const [departs, setDeparts] = useState('');
  const [arrives, setArrives] = useState('');
  const [arrivalDay, setArrivalDay] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    setError(null);

    const fromCode = from.trim().toUpperCase();
    const toCode = to.trim().toUpperCase();
    if (!IATA.test(fromCode) || !IATA.test(toCode)) {
      setError('From and To must be 3-letter airport codes, e.g. NRT and PEK.');
      return;
    }
    if (fromCode === toCode) {
      setError('From and To must be different airports.');
      return;
    }
    if (!isValidDay(day.trim())) {
      setError('Pick the date it leaves.');
      return;
    }
    const depTime = parseTimeInput(departs);
    if (!depTime) {
      setError('Pick the time it leaves.');
      return;
    }

    let arrivalTime: string | null = null;
    if (arrives.trim()) {
      const arrTime = parseTimeInput(arrives);
      if (!arrTime) {
        setError('Pick the arrival time again.');
        return;
      }
      let arrDay = arrivalDay.trim();
      if (arrDay) {
        if (!isValidDay(arrDay) || arrDay < day.trim()) {
          setError('The arrival date can’t be before the departure date.');
          return;
        }
      } else {
        // No arrival date given: an arrival clock time earlier than the
        // departure means it lands the next day (red-eyes).
        const depMinutes = depTime.hour * 60 + depTime.minute;
        const arrMinutes = arrTime.hour * 60 + arrTime.minute;
        arrDay = arrMinutes < depMinutes ? addDays(day.trim(), 1) : day.trim();
      }
      arrivalTime = wallClockISO(arrDay, arrTime);
    } else if (arrivalDay.trim()) {
      setError('Add an arrival time to go with the arrival date.');
      return;
    }

    if (!session) {
      setError('You must be signed in.');
      return;
    }

    setSaving(true);
    try {
      await createFlight(
        {
          airline: airline.trim() || null,
          flight_number: flightNumber.trim().toUpperCase() || null,
          departure_airport: fromCode,
          arrival_airport: toCode,
          departure_time: wallClockISO(day.trim(), depTime),
          arrival_time: arrivalTime,
          confirmation_code: confirmation.trim().toUpperCase() || null,
        },
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
    <FormScreen
      title="Add a Flight"
      error={error}
    >
      <FormField label="Airline (optional)" value={airline} onChangeText={setAirline} placeholder="ANA" autoCapitalize="words" />
      <FormField
        label="Flight number (optional)"
        value={flightNumber}
        onChangeText={setFlightNumber}
        placeholder="NH 961"
        autoCapitalize="characters"
      />
      <FormField label="From" value={from} onChangeText={setFrom} placeholder="NRT" autoCapitalize="characters" maxLength={3} />
      <FormField label="To" value={to} onChangeText={setTo} placeholder="PEK" autoCapitalize="characters" maxLength={3} />
      <PickerField label="Date" kind="date" value={day} onChangeText={setDay} testID="flight-day" />
      <PickerField label="Departs" kind="time" value={departs} onChangeText={setDeparts} testID="flight-departs" />
      <PickerField label="Arrives (optional)" kind="time" value={arrives} onChangeText={setArrives} testID="flight-arrives" />
      <PickerField
        label="Arrival date (only if it isn’t the same or the next day)"
        kind="date"
        value={arrivalDay}
        onChangeText={setArrivalDay}
        testID="flight-arrival-day"
      />
      <FormField
        label="Confirmation code (optional)"
        value={confirmation}
        onChangeText={setConfirmation}
        placeholder="ABC123"
        autoCapitalize="characters"
      />
      <FormButton label="Save" onPress={handleSave} loading={saving} />
      <FormButton label="Cancel" variant="text" onPress={() => router.back()} />
    </FormScreen>
  );
}
