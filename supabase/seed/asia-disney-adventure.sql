-- Seeds the 14-day plan from supabase/seed/asia-disney-adventure.json as
-- unowned trip-plan rows (created_by null; see migration 0004).
-- Idempotent: skips any day/title pair that's already present.
insert into public.itinerary_items (day, city, title, description)
select v.day::date, v.city, v.title, v.description
from (values
  ('2027-06-07', 'Tokyo', 'Arrive & check in', 'Land, transfer, settle into the Tokyo Disney Resort hotel. Realistic check-in is 5–8pm once you factor immigration and baggage for 13 people. Dinner: Toraji at Ikspiari — grill-your-own yakiniku, ~¥5,000/person; call ahead for a table for 13.'),
  ('2027-06-08', 'Tokyo', 'Tokyo day — vote needed', 'A city day between arrival and the two park days — out from the Disney hotel in the morning, back for the night. Options: Sightseeing (Meiji Shrine → Round1 Stadium, Odaiba), Shopping (Takeshita St → Omotesando → Shibuya → Don Quijote), or Foodie (Mitsukoshi depachika → Tsukiji Outer Market → ramen → Harajuku crepes).'),
  ('2027-06-09', 'Tokyo', 'Tokyo DisneySea', 'Full park day — the first of four Disney days on this trip.'),
  ('2027-06-10', 'Tokyo', 'Tokyo Disneyland', 'Full park day, then one last night at the Disney hotel.'),
  ('2027-06-11', 'Kyoto & Nara', 'Bullet train to Kyoto, then Kinkaku-ji → Arashiyama → Nara', 'Early start: booked ride from the Disney hotel to Tokyo Station, ~7am Nozomi, in Kyoto ~9:15am — drop bags at the Kyoto hotel. Then the Golden Pavilion and the Arashiyama bamboo grove; afternoon: Nara''s deer park and Todai-ji''s Great Buddha Hall, 35–45 min by train. Back to Kyoto that night (one night). Self-guided.'),
  ('2027-06-12', 'Kyoto → Beijing', 'Fly Kansai → Beijing', 'Departing from Kansai (KIX) rather than Tokyo, since Kyoto is the last Japan stop.'),
  ('2027-06-13', 'Beijing', 'Great Wall at Mutianyu', 'Full day — ~1.5hr each way, 2–3+ hours on the wall, cable car up and toboggan down. Evening: Peking duck, then a Kung Fu or acrobatics show.'),
  ('2027-06-14', 'Beijing', 'Tiananmen Square & Forbidden City', 'The two sit directly across from each other, same subway stop. Afternoon: Temple of Heaven (Summer Palace and Olympic Park are still possible swaps).'),
  ('2027-06-15', 'Beijing → Shanghai', 'High-speed train to Shanghai', '~4.5–6hr ride. A morning departure lands by early afternoon — walk the Bund once the lights come on (~6pm), dinner nearby.'),
  ('2027-06-16', 'Shanghai', 'Shanghai Disneyland', 'Full park day.'),
  ('2027-06-17', 'Shanghai', 'Half day Disney, then Pearl Tower & night cruise', 'Oriental Pearl Tower + Huangpu River night cruise as one combo ticket (~$37–47/person). Night departures start ~6:30pm.'),
  ('2027-06-18', 'Shanghai → Hong Kong', 'Fly to Hong Kong', '~3hr flight, no time zone change. Evening: Temple Street Night Market — street food, shopping, fortune-tellers.'),
  ('2027-06-19', 'Hong Kong', 'Hong Kong Disneyland', 'The one Hong Kong park day.'),
  ('2027-06-20', 'Hong Kong', 'Big Buddha, then home', 'If the flight time allows: Ngong Ping 360 cable car + the Big Buddha on Lantau, ~10 min from the airport. Then fly home.')
) as v(day, city, title, description)
where not exists (
  select 1 from public.itinerary_items i
  where i.day = v.day::date and i.title = v.title
);
