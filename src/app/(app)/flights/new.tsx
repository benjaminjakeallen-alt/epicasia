import { useRouter } from 'expo-router';
import { useState } from 'react';
import FormButton from '../../../components/form/FormButton';
import FormField from '../../../components/form/FormField';
import FormScreen from '../../../components/form/FormScreen';
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
      setError('Date must be a real date, e.g. 2027-06-11.');
      return;
    }
    const depTime = parseTimeInput(departs);
    if (!depTime) {
      setError('Departure time must look like "10:30 AM" or "22:30".');
      return;
    }

    let arrivalTime: string | null = null;
    if (arrives.trim()) {
      const arrTime = parseTimeInput(arrives);
      if (!arrTime) {
        setError('Arrival time must look like "1:45 PM" or "13:45".');
        return;
      }
      let arrDay = arrivalDay.trim();
      if (arrDay) {
        if (!isValidDay(arrDay) || arrDay < day.trim()) {
          setError('Arrival date must be a real date on or after the departure date.');
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
      setError(e instanceof Error ? e.message : 'Failed to save');
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
      <FormField label="Date" value={day} onChangeText={setDay} placeholder="2027-06-11" />
      <FormField label="Departs" value={departs} onChangeText={setDeparts} placeholder="10:30 AM" />
      <FormField label="Arrives (optional)" value={arrives} onChangeText={setArrives} placeholder="1:45 PM" />
      <FormField
        label="Arrival date (optional, if not the same day)"
        value={arrivalDay}
        onChangeText={setArrivalDay}
        placeholder="2027-06-12"
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
