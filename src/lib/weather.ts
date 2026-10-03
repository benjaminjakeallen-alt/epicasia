import AsyncStorage from '@react-native-async-storage/async-storage';

// Weather for the five cities on the route, from Open-Meteo (free, no key,
// CORS-enabled): conditions now and the next 7 days, all cities in one
// request. Each fetch is saved on the phone so the forecast still shows
// with no signal. The trip is in June, beyond any forecast until the days
// before, so each city also carries its typical June weather.

export type CityKey = 'tokyo' | 'kyoto' | 'beijing' | 'shanghai' | 'hongKong';

export const CITIES: { key: CityKey; name: string; lat: number; lng: number; june: { hi: number; lo: number; note: string } }[] = [
  { key: 'tokyo', name: 'Tokyo', lat: 35.6812, lng: 139.7671, june: { hi: 26, lo: 19, note: 'Rainy season (tsuyu) — humid, umbrella days' } },
  { key: 'kyoto', name: 'Kyoto & Nara', lat: 35.0116, lng: 135.7681, june: { hi: 28, lo: 20, note: 'Rainy season — warm and humid' } },
  { key: 'beijing', name: 'Beijing', lat: 39.9042, lng: 116.4074, june: { hi: 31, lo: 20, note: 'Hot and mostly dry — sun hat and water' } },
  { key: 'shanghai', name: 'Shanghai', lat: 31.2304, lng: 121.4737, june: { hi: 28, lo: 21, note: 'Plum rains (meiyu) — muggy, frequent showers' } },
  { key: 'hongKong', name: 'Hong Kong', lat: 22.3193, lng: 114.1694, june: { hi: 31, lo: 27, note: 'Hot, very humid, heavy showers; typhoon season starts' } },
];

export type Day = { day: string; code: number; hi: number; lo: number; rain: number | null };
export type CityWeather = { now: { temp: number; code: number } | null; days: Day[] };
export type Forecast = { cities: Partial<Record<CityKey, CityWeather>>; fetchedAt: number; source: 'live' | 'saved' };

const KEY = 'epicasia.weather';

function url() {
  const lat = CITIES.map((c) => c.lat).join(',');
  const lng = CITIES.map((c) => c.lng).join(',');
  return (
    `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}` +
    '&current=temperature_2m,weather_code' +
    '&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max' +
    '&timezone=auto&forecast_days=7'
  );
}

type Raw = {
  current?: { temperature_2m: number; weather_code: number };
  daily?: {
    time: string[];
    weather_code: number[];
    temperature_2m_max: number[];
    temperature_2m_min: number[];
    precipitation_probability_max?: (number | null)[];
  };
};

function parse(raw: Raw): CityWeather {
  const d = raw.daily;
  return {
    now: raw.current ? { temp: raw.current.temperature_2m, code: raw.current.weather_code } : null,
    days: d
      ? d.time.map((day, i) => ({
          day,
          code: d.weather_code[i],
          hi: d.temperature_2m_max[i],
          lo: d.temperature_2m_min[i],
          rain: d.precipitation_probability_max?.[i] ?? null,
        }))
      : [],
  };
}

async function fetchLive(): Promise<Forecast> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 8000);
  try {
    const res = await fetch(url(), { signal: ctrl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const body = (await res.json()) as Raw | Raw[];
    const list = Array.isArray(body) ? body : [body];
    const cities: Forecast['cities'] = {};
    CITIES.forEach((c, i) => {
      if (list[i]) cities[c.key] = parse(list[i]);
    });
    return { cities, fetchedAt: Date.now(), source: 'live' };
  } finally {
    clearTimeout(t);
  }
}

export async function savedForecast(): Promise<Forecast | null> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    return raw ? { ...(JSON.parse(raw) as Forecast), source: 'saved' } : null;
  } catch {
    return null;
  }
}

/** Live forecast (saved for later), else the last saved one, else null. */
export async function loadForecast(): Promise<Forecast | null> {
  try {
    const live = await fetchLive();
    AsyncStorage.setItem(KEY, JSON.stringify(live)).catch(() => {});
    return live;
  } catch {
    return savedForecast();
  }
}

// ---- units & labels --------------------------------------------------------

export type Unit = 'F' | 'C';
const UNIT_KEY = 'epicasia.tempUnit';
export async function savedUnit(): Promise<Unit> {
  try {
    return (await AsyncStorage.getItem(UNIT_KEY)) === 'C' ? 'C' : 'F';
  } catch {
    return 'F';
  }
}
export function saveUnit(u: Unit) {
  AsyncStorage.setItem(UNIT_KEY, u).catch(() => {});
}

/** Rounded temperature in the chosen unit, from °C. */
export function temp(c: number, unit: Unit): string {
  return `${Math.round(unit === 'F' ? (c * 9) / 5 + 32 : c)}°`;
}

/** WMO weather code → words + an Ionicons name. */
export function condition(code: number): { label: string; icon: string } {
  if (code === 0) return { label: 'Clear', icon: 'sunny-outline' };
  if (code === 1) return { label: 'Mostly clear', icon: 'sunny-outline' };
  if (code === 2) return { label: 'Partly cloudy', icon: 'partly-sunny-outline' };
  if (code === 3) return { label: 'Cloudy', icon: 'cloud-outline' };
  if (code === 45 || code === 48) return { label: 'Fog', icon: 'cloud-outline' };
  if (code >= 51 && code <= 57) return { label: 'Drizzle', icon: 'rainy-outline' };
  if (code >= 61 && code <= 67) return { label: 'Rain', icon: 'rainy-outline' };
  if (code >= 71 && code <= 77) return { label: 'Snow', icon: 'snow-outline' };
  if (code >= 80 && code <= 82) return { label: 'Showers', icon: 'rainy-outline' };
  if (code === 85 || code === 86) return { label: 'Snow showers', icon: 'snow-outline' };
  if (code >= 95) return { label: 'Thunderstorms', icon: 'thunderstorm-outline' };
  return { label: 'Mixed', icon: 'partly-sunny-outline' };
}

/** "Sat" from "2026-10-03" (the city's own date, no time zone conversion). */
export function weekday(day: string): string {
  const [y, m, d] = day.split('-').map(Number);
  return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
}
