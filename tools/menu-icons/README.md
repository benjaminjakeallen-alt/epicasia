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
