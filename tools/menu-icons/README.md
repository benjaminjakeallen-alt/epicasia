# Menu icons (3D, on clouds)

Source for `assets/images/menu/*.png` — the orbit menu's icons, styled after
the user's reference (soft, rendered miniatures sitting on puffy clouds).
Each icon is a small three.js scene built from primitives in `index.html`
(`builders.itinerary`, `flights`, `lodging`, `packing`, `journal`, `games`; lodging and packing are no longer on the menu),
lit with a warm key light + room environment and rendered to a transparent
600px PNG.

To re-render after editing a builder:

```bash
cd tools/menu-icons
npm install
python3 -m http.server 8765 &      # serve index.html + node_modules
node render.mjs                    # or: node render.mjs flights games
```

`render.mjs` expects Chromium at `/opt/pw-browsers/chromium` (the cloud dev
container) and writes `out-<name>.png` next to itself — adjust `DIR` /
`executablePath` for other machines. Then crop, pad to square and resize to
360×360 into `assets/images/menu/` (3× of the 120pt badge).

## Current icons: Higgsfield-generated (Sept 30 2026)

The code-rendered sets above were rejected; the live icons are generated.
`generate-hf.sh` (auth: `HF_API_KEY_ID` alone, no secret) → `cutout.py
<src> <dst>` (keys out the flat white background via border-connected
flood region + soft alpha ramp, un-premultiplies edges, crops, pads ×1.2
to square, 360×360 RGBA).

Chosen: **Qwen Image 3** (`MODEL=qwen`, ~$0.04/image) over Grok (more
detailed but less on-palette), Recraft and Z-Image. User direction: **no
clouds**, the object alone, and **sage green (#4f7a5c) in every object**.
The shared style prompt lives in `generate-hf.sh`; the per-icon subjects
used:

| key | subject |
|---|---|
| flights (replaced by arrivals Oct 2 2026) | a vintage silver propeller airliner with a muted sage green tail fin and a thin sage green stripe along the fuselage |
| arrivals | a vintage brass and wood immigration rubber stamp beside a muted sage green leather passport opened to a page with colorful round entry stamps (Oct 2 2026, pick of 3; the alternatives were a passport with a boarding pass tucked in, and a passport on a luggage tag) |
| itinerary | an antique rolled parchment map tied with a muted sage green silk ribbon, with a brass compass beside it |
| lodging (removed Oct 1 2026) | a traditional Japanese wooden ryokan inn with a tiled roof, paper lanterns, a muted sage green noren curtain over the door and a small green bonsai pine beside it |
| packing | a vintage muted sage green leather steamer trunk with brass corners, tan leather straps and travel stickers |
| journal | a muted sage green leather-bound travel journal with a fountain pen and pressed cherry blossoms |
| games | a small stack of ivory mahjong tiles with green carved characters on a small wooden game board with a muted sage green felt top |
| photos | a small loose fanned stack of instant film photo prints with cream borders showing soft pastel travel snapshots of mountains and temples, one print held by a tiny muted sage green clip (Oct 1 2026; a sage rangefinder camera was the alternative) |
| chat | a vintage muted sage green enamel rotary telephone with a coiled cord, cream dial and small brass details (Oct 1 2026, pick: try 2; the airmail-postcards alternative read too close to Journal) |
| satchel (utilities: converter, phrasebook, weather, pins — Oct 3 2026, user's idea and pick of 3) | an open muted sage green leather messenger bag overflowing with travel essentials springing out of the top: a small cream pocket phrasebook, folded colorful foreign banknotes, gold and silver coins, and a tiny red map pin |

**Game icons** (`assets/images/games/`, Oct 3 2026, for the Games hub; three
options each; the user picked the camera and the arcade cabinet):

| game | option | subject |
|---|---|---|
| Lost in Translation | A | a small vintage enamel street sign on a muted sage green post, the sign crowded with a playful jumble of mismatched oversized letters and a little red exclamation mark, with a tiny brass camera hanging from the post |
| | **B (picked)** | a vintage muted sage green instant camera with a freshly printed instant photo sliding out of it, the photo showing a colorful quirky little shop sign |
| | C | a cream ceramic speech bubble with a big red question mark on it, leaning against a small muted sage green pocket dictionary with a red ribbon bookmark |
| Godzilla Rampage | A | a cute chunky vinyl toy of an original cartoon green kaiju dinosaur with pale spiky back plates, roaring playfully, standing on a short red steel construction girder beside a small wooden barrel |
| | **B (picked)** | a small vintage arcade cabinet painted muted sage green with chrome trim, a red joystick and buttons, and a glowing screen showing a tiny green dinosaur climbing red girders |
| | C | a chunky voxel-style toy figure made of small cubes of a friendly green kaiju dinosaur hugging the top of a tiny pastel voxel skyscraper, with a little cube barrel in its claws |
| Konbini Review (Oct 3 2026, picked by Claude) | A | a tiny Japanese convenience store shopping basket in muted sage green plastic overflowing with colorful snacks: a rice ball in seaweed, a bright candy box, a canned drink, a pudding cup and a bag of chips |
| | **B (picked)** | a small vintage muted sage green smartphone on a little tripod filming a colorful mystery snack bag with a question mark on it, beside a melon soda can and a rice ball |
| | C | a miniature Japanese convenience store building with a muted sage green awning and glowing window full of snacks, with a giant colorful mystery snack bag with a question mark sitting in front |

All `MODEL=qwen`, cut out with `cutout.py <src> <dst> 360`.

Qwen occasionally returns "model temporarily unavailable" (not charged) —
just retry.

## Launch intro art (Sept 30 2026)

The "little planet" intro (`src/components/LaunchSequence.tsx`) uses the
same pipeline and style prompt, saved to `assets/images/launch/`:

- **Planet:** `VIEW="seen straight on at eye level as a perfect round
  sphere" MODEL=qwen ./generate-hf.sh planet "a tiny round miniature
  planet, a perfect smooth sphere of soft velvety light sage green grass
  with a gentle rolling meadow texture, only a handful of small round trees
  and a few pale stones spaced far apart, calm and minimal, soft even
  color, no paths, no roads, no water, no lakes"` (no path/lake: those
  looked like flat stickers once the planet rotated) → `cutout.py <src> planet.png 900 center
  1.0`, then resized to 720px.
- **Landmarks:** `VIEW="front three-quarter view at eye level"`, subject
  = the landmark + ", standing upright on a small flat round patch of soft
  sage green grass" (castle, torii, kinkakuji, todaiji, greatwall, heaven,
  pearl, buddha) → `cutout.py <src> <key>.png 360 bottom 1.04` (bottom
  anchor: the base sits on the image's bottom edge, which the intro sinks
  into the planet).

### Launch plane (3D sprite sheet)

`plane-sheet.png` is the `flights` builder (with `{ spinning: true }`:
rounded nose, blurred prop discs, polished metal) rendered from 36
headings by `window.renderPlaneSheet` in `index.html`:

```bash
python3 -m http.server 8765 &
node render-plane.mjs 200              # -> out-plane-sheet.png (6×6 × 200px)
node render-plane.mjs 360 0,9,18,27    # a few large test frames -> out-plane-test.png
cp out-plane-sheet.png ../../assets/images/launch/plane-sheet.png
```

Camera elevation (26°) must match `PLANE_ELEV` in `LaunchSequence.tsx`.

## Web app (PWA) icon (Oct 2 2026)

Option A of six mockups, picked by the user. Full-bleed variant of the
style prompt (not the white-background one in `generate-hf.sh`): "Square
iOS app icon artwork, full bleed edge to edge, a tiny round sage green
grass miniature planet floating in a soft misty pale blue sky, with a small
vermilion torii gate, a tiny golden pagoda and a small snow-capped Mount
Fuji standing on top, and a tiny silver propeller airliner circling it on a
thin curved path. Hyper-realistic 3D miniature style with real materials,
soft hazy golden morning light, gentle pastel palette of warm stone beige,
cream, pale misty sky blue and muted sage green (#4f7a5c), one small
vermilion accent, simple bold composition that reads at small size,
centered subject, no text, no letters, no border, no rounded corners, no
people." (Qwen still drew rounded corners; crop 4.5% per side.) Saved as
`assets/pwa-icon.png`; the sizes in `public/` are made from it (see
CLAUDE.md → Web app icon).

## Yuki's cherry blossom (Oct 3 2026)

`assets/images/yuki/blossom.png` (512², the voice assistant's glowing
blossom and the small `YukiMark`; user: "the blossom could be higher
quality in the style of the icons"). `VIEW="seen straight on, face-on from
the front" MODEL=qwen ./generate-hf.sh blossomA "a single cherry blossom
flower with five soft translucent pale pink notched petals deepening to rose
at the centre, delicate golden stamens, and two tiny muted sage green leaves
behind it"` → `cutout.py <src> blossom.png 720 center 1.06`, resized to
512. Picked over a porcelain blossom with one leaf and one on a stem (a stem
looks wrong when the blossom turns). Face-on so it can rotate in place.
