# Ideas archive

Ideas we've talked about, so nothing gets lost. Status is the user's call.

## Games

Every game scores into the shared points / leaderboards (`game_entries`,
`game_votes`, `game_scores` — see CLAUDE.md → Games).

**Built**
- **Lost in Translation:** photos of wonky English, upvotes, daily winner.
- **Godzilla Rampage:** 3D voxel arcade platformer (Chris & Emily, Shea & Heather).
- **Konbini Review:** film your reaction to a mystery snack, rate it 1–5;
  upvotes for the reaction, "Snacks" board of best → worst.
- **Trip leaderboard** across every game (placings → trip points).
- **Shinkansen Dash:** endless runner on three bullet trains, Tokyo → Kyoto.

**Shinkansen Dash skills — built Oct 12 2026** (the user's picks: Chris
pickaxe + miner's lamp, Bennett poncho glide, Emily endless slide, Miles
unlimited double jumps, Nicole boba magnet + auto-ducking crows, Jake a
manhole skateboard every 30 onigiri, Liam ninja stars — see CLAUDE.md).
Not picked: Emily's "speed reader"/"hardcover", Miles's "power chord",
Nicole's "cat-eye specs", Jake's "manhole master"/"sludge armour".

**Built Oct 14 2026 as Chain Gang Dynasty (room codes, icon A — see
CLAUDE.md). The original plan:** a 4-player co-op on the Great Wall — a
take on *Chained Together*: four travellers chained to each other must get
along the Great Wall through 3 levels of creative obstacles; Sunset
Overdrive-style art (punchy sunset colours, cel shading with bold outlines,
graffiti energy); pick from Chris, Jake, Bennett and Miles (the girls later).
- **Connecting:** the user asked for local Bluetooth "if possible" — it
  isn't from a web app: browsers' Web Bluetooth can only connect *to*
  gadgets (heart-rate straps, etc.), a phone page can't advertise itself for
  other phones to join. Options: (1) room code over the internet via
  Supabase Realtime (simplest, reliable; one phone runs the physics, the
  others send their inputs); (2) phone-to-phone WebRTC on one Wi-Fi or
  hotspot, paired by scanning QR codes (works with no internet at all, but
  more fragile, especially on iPhone).
- **Name ideas:** The Great Fall of China, Chain Gang Dynasty, Dragon's
  Tail, Wall Crawlers, Shackled Summit, Four Links Up, The Great Haul.
- **Icon options** (generated Oct 13 2026, prompts in
  `tools/menu-icons/README.md` style): A a winding wall over a grassy hill
  to a watchtower with a sage banner; B a watchtower wrapped in a heavy
  sage-and-iron chain; C a steep stretch up a ridge with red lanterns and
  sage pines.
- **Level ideas:** 1 Sunset Ramparts (crumbling battlements, swinging
  lanterns, firecracker barrels rolling down the steps); 2 Dragon Festival
  (a giant parade dragon slithering along the wall as moving platforms,
  fireworks launchers, spinning prayer wheels); 3 Storm Peak (a steep
  switchback climb at dusk, wind gusts, a collapsing tower, a zip line, ring
  the gong at the top).

**Chosen — to build (Oct 3 2026)**
- **Sushi Conveyor:** catch and match plates as the belt speeds up. Short
  rounds for train rides.
- **Head-to-head variety pack:** 4 people play short Asian-themed mini games
  together, party-game style (e.g. chopstick races, lantern catching,
  mahjong-tile snap, dumpling-folding timing, taiko rhythm). Live rooms, a
  winner per round, points to the leaderboard.

**Archived (not chosen yet)**
- **Trip Bingo:** a 5×5 card per city of things to spot (a bowing deer in
  Nara, a weird vending machine, someone asleep on the Shinkansen); photo
  proof; points per square, bonus for a line / full card.
- **Where Am I?:** someone posts a close-up photo, everyone guesses the spot
  on a map; closest wins (GeoGuessr with our own photos).
- **Price Check:** post a photo of something for sale, everyone guesses the
  price in dollars; closest wins (uses the Toolkit's rates).
- **Disney Ride Tracker:** log rides at Tokyo / Shanghai / Hong Kong Disney,
  guess wait times; "most rides" crown per park.
- **Daily Predictions:** morning bets ("Who's last to the lobby?", "Will it
  rain?"), settled by an organizer at night.
- **Panda Pong (Beijing) / Dim Sum Stack (Hong Kong):** small city-themed
  arcade games, one per leg.
- Trivia from the reunion app — not planned.

## AI

- **Yuki — voice assistant:** built (Oct 3 2026). Say "Hey Yuki" (or tap
  her) and ask anything in the app; she answers aloud with a glowing
  cherry blossom.
- **Journal help:** built (Oct 3 2026). Voice notes transcribed, and
  "write it with Yuki" drafts an entry from the day's notes and photos.
- **Later / not chosen yet:** sign & menu reader (photo → translation),
  translate in chat, photo auto-captions.

## Other

- Accessibility mode phase 2 (high-contrast / dark theme, app-wide large
  type) — see CLAUDE.md.
- A real email service (Resend / Gmail SMTP) for password-reset emails.
