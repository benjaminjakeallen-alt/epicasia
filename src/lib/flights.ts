import { cached } from './offline';
import { supabase } from './supabase';

export type Flight = {
  id: string;
  airline: string | null;
  flight_number: string | null;
  departure_airport: string | null; // IATA code, e.g. "NRT"
  arrival_airport: string | null;
  departure_time: string | null; // wall-clock timestamp, see dates.ts
  arrival_time: string | null;
  confirmation_code: string | null;
  created_by: string;
  created_at: string;
};

export type NewFlight = {
  airline: string | null;
  flight_number: string | null;
  departure_airport: string;
  arrival_airport: string;
  departure_time: string;
  arrival_time: string | null;
  confirmation_code: string | null;
};

async function fetchFlightsLive(): Promise<Flight[]> {
  const { data, error } = await supabase
    .from('flights')
    .select('*')
    .order('departure_time', { ascending: true, nullsFirst: false });

  if (error) throw error;
  return data ?? [];
}

/** Cached for offline use. */
export async function fetchFlights(): Promise<Flight[]> {
  return cached('flights', () => fetchFlightsLive());
}

export async function createFlight(input: NewFlight, createdBy: string): Promise<void> {
  const { error } = await supabase.from('flights').insert({ ...input, created_by: createdBy });
  if (error) throw error;
}

export async function deleteFlight(id: string): Promise<void> {
  const { error } = await supabase.from('flights').delete().eq('id', id);
  if (error) throw error;
}
