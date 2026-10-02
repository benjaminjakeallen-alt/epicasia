import AsyncStorage from '@react-native-async-storage/async-storage';

// Currency converter data. Rates come from open.er-api.com (free, no key,
// updated daily, CORS-enabled so the web build works too; attribution
// requested: "Rates By Exchange Rate API"), with frankfurter.dev as a
// backup. Every successful fetch is saved on the phone, so the converter
// keeps working with no signal; on a first run with no signal at all it
// falls back to the approximate rates bundled below.

export type Currency = { code: string; name: string; symbol: string; decimals: number };

/** The trip's currencies, in route order. */
export const LOCAL: (Currency & { country: 'japan' | 'china' | 'hongKong'; place: string })[] = [
  { code: 'JPY', name: 'Japanese yen', symbol: '¥', decimals: 0, country: 'japan', place: 'Japan' },
  { code: 'CNY', name: 'Chinese yuan', symbol: '¥', decimals: 2, country: 'china', place: 'China' },
  { code: 'HKD', name: 'Hong Kong dollar', symbol: 'HK$', decimals: 2, country: 'hongKong', place: 'Hong Kong' },
];

/** Currencies travelers might think in. US dollars first (the group's default). */
export const HOME: Currency[] = [
  { code: 'USD', name: 'US dollar', symbol: '$', decimals: 2 },
  { code: 'GBP', name: 'British pound', symbol: '£', decimals: 2 },
  { code: 'EUR', name: 'Euro', symbol: '€', decimals: 2 },
  { code: 'CAD', name: 'Canadian dollar', symbol: 'C$', decimals: 2 },
  { code: 'AUD', name: 'Australian dollar', symbol: 'A$', decimals: 2 },
  { code: 'NZD', name: 'New Zealand dollar', symbol: 'NZ$', decimals: 2 },
];

const ALL = [...LOCAL, ...HOME];
export const currency = (code: string): Currency => ALL.find((c) => c.code === code) ?? HOME[0];

/** Units per 1 US dollar. */
export type Rates = Record<string, number>;
export type RateSet = {
  rates: Rates;
  /** The day the rates are from ("YYYY-MM-DD"). */
  date: string;
  /** live = just fetched; saved = an earlier fetch (offline); bundled = built in, approximate. */
  source: 'live' | 'saved' | 'bundled';
};

// Approximate rates (open.er-api.com, Oct 2 2026) for a first run with no
// signal. Shown as "approximate" in the app.
export const BUNDLED: RateSet = {
  rates: { USD: 1, JPY: 157.9, CNY: 6.715, HKD: 7.847, GBP: 0.7571, EUR: 0.8909, CAD: 1.424, AUD: 1.441, NZD: 1.782 },
  date: '2026-10-02',
  source: 'bundled',
};

const KEY = 'epicasia.rates';
const CODES = ALL.map((c) => c.code);

function pick(rates: Record<string, number>): Rates | null {
  const out: Rates = {};
  for (const code of CODES) {
    const r = code === 'USD' ? 1 : rates[code];
    if (typeof r !== 'number' || !(r > 0)) return null;
    out[code] = r;
  }
  return out;
}

async function fetchJson(url: string, ms = 6000): Promise<any> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(t);
  }
}

async function fetchLive(): Promise<RateSet> {
  try {
    const d = await fetchJson('https://open.er-api.com/v6/latest/USD');
    const rates = d?.result === 'success' ? pick(d.rates) : null;
    if (rates) {
      const date = new Date((d.time_last_update_unix ?? Date.now() / 1000) * 1000).toISOString().slice(0, 10);
      return { rates, date, source: 'live' };
    }
  } catch {
    // try the backup
  }
  const d = await fetchJson(`https://api.frankfurter.dev/v1/latest?base=USD&symbols=${CODES.filter((c) => c !== 'USD').join(',')}`);
  const rates = pick(d?.rates ?? {});
  if (!rates) throw new Error('No rates');
  return { rates, date: String(d.date), source: 'live' };
}

/** The last rates saved on this phone, if any. */
export async function savedRates(): Promise<RateSet | null> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return null;
    const r = JSON.parse(raw) as RateSet;
    return pick(r.rates) ? { ...r, source: 'saved' } : null;
  } catch {
    return null;
  }
}

/** Fresh rates if the network allows (and saves them); otherwise saved, otherwise bundled. */
export async function loadRates(): Promise<RateSet> {
  try {
    const live = await fetchLive();
    AsyncStorage.setItem(KEY, JSON.stringify(live)).catch(() => {});
    return live;
  } catch {
    return (await savedRates()) ?? BUNDLED;
  }
}

export function convert(amount: number, from: string, to: string, rates: Rates): number {
  return (amount / rates[from]) * rates[to];
}

/** "¥12,345", "$1,234.57", "HK$78.50" (no locale APIs, so it's identical everywhere). */
export function formatMoney(amount: number, code: string, opts?: { trimWhole?: boolean }): string {
  const c = currency(code);
  const whole = opts?.trimWhole && Number.isInteger(amount);
  const fixed = Math.abs(amount).toFixed(whole ? 0 : c.decimals);
  const [int, dec] = fixed.split('.');
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${amount < 0 ? '−' : ''}${c.symbol}${grouped}${dec ? `.${dec}` : ''}`;
}

/** Handy reference amounts in each local currency (prices you'll actually see). */
export const QUICK: Record<string, number[]> = {
  JPY: [100, 500, 1000, 3000, 5000, 10000],
  CNY: [10, 20, 50, 100, 200, 500],
  HKD: [10, 20, 50, 100, 200, 500],
};

const HOME_KEY = 'epicasia.homeCurrency';
export async function savedHomeCurrency(): Promise<string> {
  try {
    const v = await AsyncStorage.getItem(HOME_KEY);
    return v && HOME.some((h) => h.code === v) ? v : 'USD';
  } catch {
    return 'USD';
  }
}
export function saveHomeCurrency(code: string) {
  AsyncStorage.setItem(HOME_KEY, code).catch(() => {});
}

/** "Oct 2" from "2026-10-02". */
export function shortDate(day: string): string {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const [, m, d] = day.split('-').map(Number);
  return m && d ? `${months[m - 1]} ${d}` : day;
}
