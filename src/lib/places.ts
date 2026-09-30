import type { ImageSourcePropType } from 'react-native';
import { legColors } from '../theme/colors';

// Trip photos (from the user's "Asia Disney Adventure" trip-plan artifact),
// bundled in assets/images/places/, resized to ≤1100px.
export const PHOTOS = {
  tokyoFuji: require('../../assets/images/places/tokyo-fuji.jpg'),
  tokyoMeiji: require('../../assets/images/places/tokyo-meiji.jpg'),
  tokyoDisneySea: require('../../assets/images/places/tokyo-disneysea.jpg'),
  kyotoKinkakuji: require('../../assets/images/places/kyoto-kinkakuji.jpg'),
  naraDeer: require('../../assets/images/places/nara-deer.jpg'),
  beijingGreatWall: require('../../assets/images/places/beijing-great-wall.jpg'),
  shanghaiDisney: require('../../assets/images/places/shanghai-disney.jpg'),
  shanghaiPearlTower: require('../../assets/images/places/shanghai-pearl-tower.jpg'),
  hongKongPeak: require('../../assets/images/places/hong-kong-peak.jpg'),
} satisfies Record<string, ImageSourcePropType>;

export type Stop = {
  key: string;
  city: string;
  country: string;
  dates: string;
  /** First and last night of the leg ("YYYY-MM-DD") — pre-fills a new stay. */
  checkIn: string;
  checkOut: string;
  color: string;
  photo: ImageSourcePropType;
};

// The five legs, in order — drives the home screen's route cards.
export const STOPS: Stop[] = [
  { key: 'tokyo', city: 'Tokyo', country: 'Japan', dates: 'Jun 6 – 9', checkIn: '2027-06-06', checkOut: '2027-06-09', color: legColors.tokyo, photo: PHOTOS.tokyoFuji },
  { key: 'kyoto', city: 'Kyoto & Nara', country: 'Japan', dates: 'Jun 9 – 11', checkIn: '2027-06-09', checkOut: '2027-06-11', color: legColors.kyoto, photo: PHOTOS.kyotoKinkakuji },
  { key: 'beijing', city: 'Beijing', country: 'China', dates: 'Jun 11 – 14', checkIn: '2027-06-11', checkOut: '2027-06-14', color: legColors.beijing, photo: PHOTOS.beijingGreatWall },
  { key: 'shanghai', city: 'Shanghai', country: 'China', dates: 'Jun 14 – 17', checkIn: '2027-06-14', checkOut: '2027-06-17', color: legColors.shanghai, photo: PHOTOS.shanghaiDisney },
  { key: 'hongKong', city: 'Hong Kong', country: 'China', dates: 'Jun 17 – 19', checkIn: '2027-06-17', checkOut: '2027-06-19', color: legColors.hongKong, photo: PHOTOS.hongKongPeak },
];

// Free-text city -> its leg. For "Kyoto → Beijing" the last-mentioned city
// wins, matching legColorForCity().
const CITY_STOPS: [string, string][] = [
  ['tokyo', 'tokyo'],
  ['kyoto', 'kyoto'],
  ['nara', 'kyoto'],
  ['osaka', 'kyoto'],
  ['beijing', 'beijing'],
  ['shanghai', 'shanghai'],
  ['hong kong', 'hongKong'],
];

export function stopForCity(city: string | null | undefined): Stop | null {
  if (!city) return null;
  const lower = city.toLowerCase();
  let best: { at: number; key: string } | null = null;
  for (const [name, key] of CITY_STOPS) {
    const at = lower.lastIndexOf(name);
    if (at !== -1 && (!best || at > best.at)) best = { at, key };
  }
  return STOPS.find((s) => s.key === best?.key) ?? null;
}

// Airports on (or near) the route -> short name + leg, for flight cards.
const AIRPORTS: Record<string, { name: string; stop: string }> = {
  NRT: { name: 'Tokyo Narita', stop: 'tokyo' },
  HND: { name: 'Tokyo Haneda', stop: 'tokyo' },
  KIX: { name: 'Osaka Kansai', stop: 'kyoto' },
  ITM: { name: 'Osaka Itami', stop: 'kyoto' },
  PEK: { name: 'Beijing Capital', stop: 'beijing' },
  PKX: { name: 'Beijing Daxing', stop: 'beijing' },
  PVG: { name: 'Shanghai Pudong', stop: 'shanghai' },
  SHA: { name: 'Shanghai Hongqiao', stop: 'shanghai' },
  HKG: { name: 'Hong Kong', stop: 'hongKong' },
};

export function airportName(code: string | null | undefined): string | null {
  return code ? (AIRPORTS[code.toUpperCase()]?.name ?? null) : null;
}

export function stopForAirport(code: string | null | undefined): Stop | null {
  const key = code ? AIRPORTS[code.toUpperCase()]?.stop : undefined;
  return STOPS.find((s) => s.key === key) ?? null;
}

// Thumbnail for an itinerary day, picked from its title first (so "Tokyo
// DisneySea" or "Great Wall" get the specific photo), then its city.
export function photoForDay(title: string, city: string | null): ImageSourcePropType | null {
  const t = `${title} ${city ?? ''}`.toLowerCase();
  if (t.includes('disneysea')) return PHOTOS.tokyoDisneySea;
  if (t.includes('great wall')) return PHOTOS.beijingGreatWall;
  if (t.includes('pearl tower')) return PHOTOS.shanghaiPearlTower;
  if (t.includes('shanghai disney')) return PHOTOS.shanghaiDisney;
  if (t.includes('meiji') || t.includes('vote needed')) return PHOTOS.tokyoMeiji;
  if (t.includes('nara') || t.includes('kinkaku')) return PHOTOS.kyotoKinkakuji;
  const c = (city ?? '').toLowerCase();
  const last = ['hong kong', 'shanghai', 'beijing', 'kyoto', 'tokyo']
    .map((name) => ({ name, at: c.lastIndexOf(name) }))
    .filter((m) => m.at !== -1)
    .sort((a, b) => b.at - a.at)[0]?.name;
  switch (last) {
    case 'tokyo':
      return PHOTOS.tokyoFuji;
    case 'kyoto':
      return PHOTOS.kyotoKinkakuji;
    case 'beijing':
      return PHOTOS.beijingGreatWall;
    case 'shanghai':
      return PHOTOS.shanghaiDisney;
    case 'hong kong':
      return PHOTOS.hongKongPeak;
    default:
      return null;
  }
}
