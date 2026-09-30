# Menu icons (3D, on clouds)

Source for `assets/images/menu/*.png` — the orbit menu's icons, styled after
the user's reference (soft, rendered miniatures sitting on puffy clouds).
Each icon is a small three.js scene built from primitives in `index.html`
(`builders.itinerary`, `flights`, `lodging`, `packing`, `journal`, `games`),
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
| flights | a vintage silver propeller airliner with a muted sage green tail fin and a thin sage green stripe along the fuselage |
| itinerary | an antique rolled parchment map tied with a muted sage green silk ribbon, with a brass compass beside it |
| lodging | a traditional Japanese wooden ryokan inn with a tiled roof, paper lanterns, a muted sage green noren curtain over the door and a small green bonsai pine beside it |
| packing | a vintage muted sage green leather steamer trunk with brass corners, tan leather straps and travel stickers |
| journal | a muted sage green leather-bound travel journal with a fountain pen and pressed cherry blossoms |
| games | a small stack of ivory mahjong tiles with green carved characters on a small wooden game board with a muted sage green felt top |

Qwen occasionally returns "model temporarily unavailable" (not charged) —
just retry.

## Launch intro art (Sept 30 2026)

The "little planet" intro (`src/components/LaunchSequence.tsx`) uses the
same pipeline and style prompt, saved to `assets/images/launch/`:

- **Planet:** `VIEW="seen straight on at eye level as a perfect round
  sphere" MODEL=qwen ./generate-hf.sh planet "a tiny round miniature
  planet, a perfect sphere covered in soft velvety sage green grass and
  moss, with a small pale blue lake, a winding cream stone path, tiny round
  trees and a few small rocks"` → `cutout.py <src> planet.png 900 center
  1.0`, then resized to 720px.
- **Landmarks:** `VIEW="front three-quarter view at eye level"`, subject
  = the landmark + ", standing upright on a small flat round patch of soft
  sage green grass" (castle, torii, kinkakuji, todaiji, greatwall, heaven,
  pearl, buddha) → `cutout.py <src> <key>.png 360 bottom 1.04` (bottom
  anchor: the base sits on the image's bottom edge, which the intro sinks
  into the planet).
