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

## Next: replace these with Higgsfield-generated images (planned)

The user rejected both code-rendered sets (first "cartoony", then the
rustic pass "not the direction"). They want the style of their reference:
hyper-real, finely detailed miniature objects standing on soft fluffy
clouds in hazy pastel morning light (like the landmark-on-cloud mockup),
but **original objects, not copies of real landmarks**.

Plan: generate them with the Higgsfield API via `generate-hf.sh <name>
"<subject>" [try]` (Recraft V4.1 1K text-to-image, polls until done, writes
`$OUT/<name>-<try>.png`). The credential lives in the cloud environment as
**`HF_API_KEY_ID` only — there is no separate secret**; the header
`Authorization: Key $HF_API_KEY_ID` authenticates on its own (verified: a
status call returns 404 for a bogus request id rather than 401). Never print
or log the key value.

**Blocked (Sept 30 2026):** submitting returns
`{"detail":"not_enough_credits"}` — the user's Higgsfield API account needs
credits (console.higgsfield.ai) before anything can be generated.

Shared style prompt (keep identical across all six for consistency):

> Hyper-realistic 3D miniature of **[SUBJECT]**, finely detailed, resting on
> a soft fluffy white cumulus cloud, hazy morning sunlight, soft pastel
> palette of warm stone beige and pale sky blue, gentle atmospheric haze,
> soft shadows, three-quarter view from slightly above, centered, single
> object, plain transparent (or flat pale #E6EDF0) background, no text, no
> people, square 1:1.

| Menu | Subject |
|---|---|
| itinerary | an antique rolled parchment map tied with a ribbon, with a brass compass beside it |
| flights | a vintage silver propeller airliner in flight |
| lodging | a traditional Japanese wooden ryokan inn with a tiled roof and paper lanterns |
| packing | a vintage leather steamer trunk with brass corners and travel stickers |
| journal | a leather-bound travel journal with a fountain pen and pressed cherry blossoms |
| games | a stack of ivory mahjong tiles and a small wooden game board |

Steps: generate (1–3 tries each, it costs the user's Higgsfield credits) →
**show the user all six before touching the app** → on approval, remove
backgrounds if not transparent, crop to content, pad to square, resize to
360×360 PNG into `assets/images/menu/<key>.png` (same filenames, so
`src/app/(app)/index.tsx` needs no change) → screenshot the home ring →
commit + push (Vercel auto-deploys epicasia.vercel.app).
