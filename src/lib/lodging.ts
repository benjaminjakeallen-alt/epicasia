import { supabase } from './supabase';

export type Stay = {
  id: string;
  city: string | null;
  name: string;
  address: string | null;
  check_in: string | null; // "YYYY-MM-DD"
  check_out: string | null;
  confirmation_code: string | null;
  notes: string | null;
  created_by: string;
  created_at: string;
};

export type NewStay = {
  name: string;
  city: string | null;
  address: string | null;
  check_in: string;
  check_out: string;
  confirmation_code: string | null;
  notes: string | null;
};

export async function fetchLodging(): Promise<Stay[]> {
  const { data, error } = await supabase
    .from('lodging')
    .select('*')
    .order('check_in', { ascending: true, nullsFirst: false });

  if (error) throw error;
  return data ?? [];
}

export async function createStay(input: NewStay, createdBy: string): Promise<void> {
  const { error } = await supabase.from('lodging').insert({ ...input, created_by: createdBy });
  if (error) throw error;
}

export async function deleteStay(id: string): Promise<void> {
  const { error } = await supabase.from('lodging').delete().eq('id', id);
  if (error) throw error;
}
