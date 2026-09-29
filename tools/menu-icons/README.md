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
