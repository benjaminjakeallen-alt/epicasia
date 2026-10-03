import { Platform } from 'react-native';
import { cached } from './offline';
import { supabase } from './supabase';
import type { CityKey } from './weather';

// Map pins: the group's shared places (0012_map_pins.sql). Anyone on the
// trip adds them; only the person who added one (or an admin) removes it.
// A pin opens in Apple Maps or Google Maps — by its saved position when it
// has one, otherwise by searching its name and address. The address is
// best written the local way (e.g. 上海市黄浦区…) so it can be shown to a
// taxi driver full screen. (Google Maps doesn't work in mainland China;
// Apple Maps does.)

export type PinCategory = 'hotel' | 'meet' | 'food' | 'sight' | 'shop' | 'other';

export const PIN_CATEGORIES: { key: PinCategory; label: string; icon: string }[] = [
  { key: 'hotel', label: 'Hotel', icon: 'bed-outline' },
  { key: 'meet', label: 'Meeting point', icon: 'people-outline' },
  { key: 'food', label: 'Food', icon: 'restaurant-outline' },
  { key: 'sight', label: 'Sight', icon: 'camera-outline' },
  { key: 'shop', label: 'Shop', icon: 'bag-handle-outline' },
  { key: 'other', label: 'Other', icon: 'location-outline' },
];

export const pinCategory = (k: string) => PIN_CATEGORIES.find((c) => c.key === k) ?? PIN_CATEGORIES[5];

export type Pin = {
  id: string;
  created_by: string | null;
  name: string;
  address: string | null;
  note: string | null;
  category: PinCategory;
  city: CityKey | null;
  lat: number | null;
  lng: number | null;
  created_at: string;
};

export type NewPin = Omit<Pin, 'id' | 'created_by' | 'created_at'>;

async function fetchPinsLive(): Promise<Pin[]> {
  const { data, error } = await supabase.from('map_pins').select('*').order('created_at', { ascending: true });
  if (error) throw error;
  return (data ?? []) as Pin[];
}

/** Everyone's pins. Cached for offline use. */
export async function fetchPins(): Promise<Pin[]> {
  return cached('pins', () => fetchPinsLive());
}

const clean = (s: string | null | undefined, max: number) => {
  const t = (s ?? '').trim();
  return t ? t.slice(0, max) : null;
};

export async function addPin(userId: string, pin: NewPin): Promise<void> {
  const name = (pin.name ?? '').trim().replace(/\s+/g, ' ');
  if (!name || name.length > 80) throw new Error('Give the place a name (up to 80 characters).');
  const { error } = await supabase.from('map_pins').insert({
    created_by: userId,
    name,
    address: clean(pin.address, 300),
    note: clean(pin.note, 500),
    category: pin.category,
    city: pin.city,
    lat: pin.lat,
    lng: pin.lng,
  });
  if (error) throw error;
}

export async function deletePin(id: string): Promise<void> {
  const { error } = await supabase.from('map_pins').delete().eq('id', id);
  if (error) throw error;
}

/** Links that open the pin in Apple Maps and Google Maps. */
export function mapLinks(pin: Pick<Pin, 'name' | 'address' | 'lat' | 'lng'>): { apple: string; google: string } {
  const q = encodeURIComponent(pin.name);
  if (pin.lat != null && pin.lng != null) {
    const ll = `${pin.lat},${pin.lng}`;
    return {
      apple: `https://maps.apple.com/?q=${q}&ll=${ll}`,
      google: `https://www.google.com/maps/search/?api=1&query=${ll}`,
    };
  }
  const where = encodeURIComponent([pin.name, pin.address].filter(Boolean).join(', '));
  return {
    apple: `https://maps.apple.com/?q=${q}${pin.address ? `&address=${encodeURIComponent(pin.address)}` : ''}`,
    google: `https://www.google.com/maps/search/?api=1&query=${where}`,
  };
}

/**
 * Where the phone is now, for "Use where I am". Returns null when location
 * access is declined. (expo-location; the browser's geolocation on web.)
 */
export async function currentPosition(): Promise<{ lat: number; lng: number; accuracy: number | null } | null> {
  const Location = await import('expo-location');
  const perm = await Location.requestForegroundPermissionsAsync();
  if (!perm.granted) return null;
  const pos = await Location.getCurrentPositionAsync({
    accuracy: Platform.OS === 'web' ? Location.Accuracy.Balanced : Location.Accuracy.High,
  });
  return {
    lat: Math.round(pos.coords.latitude * 1e6) / 1e6,
    lng: Math.round(pos.coords.longitude * 1e6) / 1e6,
    accuracy: pos.coords.accuracy ?? null,
  };
}
