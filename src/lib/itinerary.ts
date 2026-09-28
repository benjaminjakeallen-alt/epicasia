import { supabase } from './supabase';

export type ItineraryItem = {
  id: string;
  day: string; // date, "YYYY-MM-DD"
  city: string | null;
  title: string;
  description: string | null;
  start_time: string | null; // timestamptz ISO string
  end_time: string | null;
  created_by: string;
  created_at: string;
};

export async function fetchItinerary(): Promise<ItineraryItem[]> {
  const { data, error } = await supabase
    .from('itinerary_items')
    .select('*')
    .order('day', { ascending: true })
    .order('start_time', { ascending: true, nullsFirst: false });

  if (error) throw error;
  return data ?? [];
}

export async function createItineraryItem(
  input: {
    day: string;
    title: string;
    city?: string | null;
    description?: string | null;
    start_time?: string | null;
  },
  createdBy: string,
): Promise<void> {
  const { error } = await supabase.from('itinerary_items').insert({
    day: input.day,
    title: input.title,
    city: input.city || null,
    description: input.description || null,
    start_time: input.start_time || null,
    created_by: createdBy,
  });

  if (error) throw error;
}

export async function deleteItineraryItem(id: string): Promise<void> {
  const { error } = await supabase.from('itinerary_items').delete().eq('id', id);
  if (error) throw error;
}
