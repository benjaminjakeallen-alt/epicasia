// Arrivals: getting into each country and through each airport on the route.
// Plain content, bundled with the app so it works with no signal.
//
// Entry rules are written for US passports and were last checked in
// October 2026. They can change before the trip (June 2027) — every rule
// links to the official source, and the app tells travelers to re-check
// 4–6 weeks before flying. Update CHECKED and the text together.

import { legColors, legTextColors } from '../theme/colors';

export const CHECKED = 'October 2026';
export const PASSPORT = 'US passports';

export type Link = { label: string; url: string };

export type Country = {
  key: 'japan' | 'china' | 'hongKong';
  name: string;
  /** Leg keys in this country (for colors). */
  legs: string[];
  dates: string;
  /** One line: do you need a visa? */
  entry: string;
  visa: string[];
  forms: string[];
  tips: string[];
  links: Link[];
  airports: string[];
};

export type Airport = {
  code: string;
  name: string;
  city: string;
  country: Country['key'];
  /** What this airport is on the route: where you arrive, leave, or both. */
  role: string;
  arrive?: string[];
  depart?: string[];
  toCity: string[];
  map: Link;
};

export const COUNTRIES: Country[] = [
  {
    key: 'japan',
    name: 'Japan',
    legs: ['tokyo', 'kyoto'],
    dates: 'Jun 6 – 12',
    entry: 'No visa needed for a tourist stay of up to 90 days.',
    visa: [
      'US passport holders can visit visa-free for up to 90 days as tourists.',
      'Your passport must be valid for your whole stay. Have your onward flight (to Beijing) ready to show.',
    ],
    forms: [
      'Visit Japan Web: register your passport, flight and customs declaration before you fly. It gives you QR codes for immigration and customs, so you skip the paper forms.',
      'Screenshot the QR codes and add them to My documents — airport Wi-Fi can be slow.',
    ],
    tips: [
      'Get a transit IC card (Suica or PASMO, or add Suica to Apple Wallet) for trains, buses and convenience stores.',
      'Cash is still common: 7-Eleven ATMs take foreign cards.',
    ],
    links: [
      { label: 'Visit Japan Web', url: 'https://www.vjw.digital.go.jp/' },
      { label: 'Japan visa exemptions (Ministry of Foreign Affairs)', url: 'https://www.mofa.go.jp/j_info/visit/visa/short/novisa.html' },
      { label: 'US State Dept: Japan', url: 'https://travel.state.gov/content/travel/en/international-travel/International-Travel-Country-Information-Pages/Japan.html' },
    ],
    airports: ['NRT', 'KIX'],
  },
  {
    key: 'china',
    name: 'Mainland China',
    legs: ['beijing', 'shanghai'],
    dates: 'Jun 12 – 18',
    entry: 'Visa-free transit may cover this leg; otherwise you need a tourist (L) visa. Decide early.',
    visa: [
      'Option 1 — 240-hour visa-free transit: available to US citizens flying from one country or region to a different one through China. Japan → China → Hong Kong counts, because Hong Kong is a separate region for this rule. You must hold a confirmed onward ticket out of mainland China within 240 hours (10 days), enter at an eligible port (Beijing and Shanghai airports are), and stay within the permitted areas (Beijing and Shanghai both are).',
      'At immigration, go to the counter for visa-free transit and show your onward ticket to Hong Kong.',
      'Option 2 — tourist (L) visa: apply through the Chinese Visa Application Service Center weeks ahead. Choose this if anyone in your group doesn’t meet the transit rules, or if the rules change.',
      'Passports should have at least 6 months’ validity and blank pages.',
    ],
    forms: [
      'Arrival card: fill it in on the plane or at the airport (an online version is also offered). Keep your passport on you — hotels register every guest with the police.',
    ],
    tips: [
      'Set up Alipay or WeChat Pay with a foreign card before you go — most shops and taxis expect it.',
      'Google, WhatsApp and Instagram are blocked in mainland China. Roaming data from your home carrier, or a travel eSIM, usually still reaches them.',
      'Download offline maps and translation before you land.',
    ],
    links: [
      { label: 'National Immigration Administration (visa-free transit)', url: 'https://en.nia.gov.cn/' },
      { label: 'Chinese Visa Application Service Center', url: 'https://www.visaforchina.cn/' },
      { label: 'US State Dept: China', url: 'https://travel.state.gov/content/travel/en/international-travel/International-Travel-Country-Information-Pages/China.html' },
    ],
    airports: ['PEK', 'PVG'],
  },
  {
    key: 'hongKong',
    name: 'Hong Kong',
    legs: ['hongKong'],
    dates: 'Jun 18 – 20',
    entry: 'No visa needed for a visit of up to 90 days.',
    visa: [
      'US passport holders can visit visa-free for up to 90 days.',
      'Hong Kong has its own immigration, separate from mainland China — you pass through it even when arriving from Shanghai.',
    ],
    forms: ['No arrival form. Immigration gives you a small landing slip — keep it with your passport until you leave.'],
    tips: [
      'Get an Octopus card (or add it to Apple Wallet) for the MTR, buses, ferries and shops.',
      'Google, WhatsApp and Instagram work normally again here.',
    ],
    links: [
      { label: 'Hong Kong Immigration Department', url: 'https://www.immd.gov.hk/eng/' },
      { label: 'US State Dept: Hong Kong', url: 'https://travel.state.gov/content/travel/en/international-travel/International-Travel-Country-Information-Pages/HongKong.html' },
    ],
    airports: ['HKG'],
  },
];

const AIRPORTS: Airport[] = [
  {
    code: 'NRT',
    name: 'Narita International',
    city: 'Tokyo',
    country: 'japan',
    role: 'Arrive in Japan',
    arrive: [
      'Follow the yellow Arrivals (到着) signs from the gate.',
      'Immigration: take the Foreign Passports lanes. Show the Visit Japan Web immigration QR, then fingerprints and a photo.',
      'Baggage claim: find your flight’s carousel on the screens.',
      'Customs: scan the Visit Japan Web customs QR at the e-gates (or hand in the paper declaration).',
      'Arrivals lobby: train ticket counters, bus counters and the taxi rank are all on this level.',
    ],
    toCity: [
      'Narita Express (N’EX) — direct to Tokyo, Shinagawa and Shinjuku stations, about 1 hour.',
      'Keisei Skyliner — to Ueno and Nippori, about 45 minutes.',
      'Airport Limousine Bus — to many central hotels, 75–120 minutes depending on traffic.',
    ],
    map: { label: 'Narita airport maps', url: 'https://www.narita-airport.jp/en/' },
  },
  {
    code: 'KIX',
    name: 'Kansai International',
    city: 'Osaka (for Kyoto & Nara)',
    country: 'japan',
    role: 'Leave Japan for Beijing',
    depart: [
      'Arrive 2½–3 hours before an international flight.',
      'Check in at your airline’s counter (Terminal 1 for most full-service airlines; check your booking).',
      'Security, then departure immigration — the automated gates are fastest.',
      'Use up your yen before immigration; change leftovers airside if you need to.',
    ],
    toCity: ['From Kyoto: JR Haruka limited express to Kansai Airport, about 75–80 minutes.'],
    map: { label: 'Kansai airport maps', url: 'https://www.kansai-airport.or.jp/en/' },
  },
  {
    code: 'PEK',
    name: 'Beijing Capital International',
    city: 'Beijing',
    country: 'china',
    role: 'Arrive in China',
    arrive: [
      'Follow the Arrivals (到达) signs from the gate.',
      'Have your completed arrival card, passport and onward ticket to Hong Kong ready.',
      'Immigration: using visa-free transit? Go to the counter marked for visa-free / 240-hour transit. With a visa, use the Foreigners lanes. Fingerprints are taken.',
      'Baggage claim, then customs: green channel if you have nothing to declare.',
      'Arrivals hall: change a little cash or use Alipay/WeChat Pay from here on.',
    ],
    toCity: [
      'Airport Express train — to Dongzhimen and Sanyuanqiao for the subway, about 20–30 minutes.',
      'Taxi — only from the official taxi rank; use DiDi in Alipay if you prefer an app.',
    ],
    map: { label: 'Beijing Capital airport', url: 'https://en.bcia.com.cn/' },
  },
  {
    code: 'PVG',
    name: 'Shanghai Pudong International',
    city: 'Shanghai',
    country: 'china',
    role: 'Leave mainland China for Hong Kong',
    depart: [
      'Arrive 2½–3 hours early: departures to Hong Kong go through China’s exit immigration.',
      'Check in, then exit immigration (passport and boarding pass), then security.',
      'On visa-free transit? Leaving within the 240 hours is the rule — don’t miss this flight.',
    ],
    toCity: [
      'Maglev train — to Longyang Road, about 8 minutes, then the subway.',
      'Metro Line 2 — direct into the city, about 1 hour.',
    ],
    map: { label: 'Shanghai airports', url: 'https://www.shanghaiairport.com/en/' },
  },
  {
    code: 'HKG',
    name: 'Hong Kong International',
    city: 'Hong Kong',
    country: 'hongKong',
    role: 'Arrive in Hong Kong; fly home',
    arrive: [
      'Follow the Arrival signs from the gate (there may be a short train ride).',
      'Immigration: Visitors lanes. You get a landing slip — keep it.',
      'Baggage claim, then customs: green channel if you have nothing to declare.',
      'Arrival hall: Airport Express ticket desks and the Octopus counter are right there.',
    ],
    depart: [
      'Flying home on a participating airline? In-town check-in at Hong Kong or Kowloon station lets you drop bags in the city on the way.',
      'Arrive 2½–3 hours early; departure immigration has e-Channel gates for visitors.',
    ],
    toCity: [
      'Airport Express — to Kowloon and Hong Kong stations, about 25 minutes, with free shuttle buses to many hotels.',
      'Taxis — red taxis go to Kowloon and Hong Kong Island.',
    ],
    map: { label: 'Hong Kong airport maps', url: 'https://www.hongkongairport.com/en/' },
  },
];

export function countryByKey(key: string): Country | undefined {
  return COUNTRIES.find((c) => c.key === key);
}

/** A country's color: its first leg's fill (stripes) and text shade. */
export function countryColor(key: Country['key']): { fill: string; text: string } {
  const leg = key === 'japan' ? 'tokyo' : key === 'china' ? 'beijing' : 'hongKong';
  return { fill: legColors[leg], text: legTextColors[leg] };
}

export function airportByCode(code: string): Airport | undefined {
  return AIRPORTS.find((a) => a.code === code.toUpperCase());
}

/** The before-you-go checklist (items are saved per phone when ticked). */
export const CHECKLIST: { id: string; text: string }[] = [
  { id: 'passport', text: 'Passport valid 6+ months past the trip, with blank pages' },
  { id: 'china-visa', text: 'China: decide visa-free transit or an L visa (and apply if needed)' },
  { id: 'vjw', text: 'Japan: complete Visit Japan Web and save the QR codes' },
  { id: 'insurance', text: 'Travel insurance, with the policy saved in My documents' },
  { id: 'payments', text: 'Alipay or WeChat Pay set up with a foreign card' },
  { id: 'bank', text: 'Tell your bank and card company where you’re going' },
  { id: 'data', text: 'Phone plan or eSIM that roams in Japan, China and Hong Kong' },
  { id: 'recheck', text: 'Re-check the entry rules 4–6 weeks before flying' },
];
