#!/usr/bin/env bash
# usage: gen.sh <name> <subject> [try]
set -euo pipefail
name=$1; subject=$2; try=${3:-1}
OUT=${OUT:-.}
STYLE="Hyper-realistic 3D miniature of ${subject}, finely detailed, resting on a soft fluffy white cumulus cloud, hazy morning sunlight, soft pastel palette of warm stone beige and pale sky blue, gentle atmospheric haze, soft shadows, three-quarter view from slightly above, centered, single object, plain flat pale #E6EDF0 background, no text, no people, square 1:1."
body=$(jq -n --arg p "$STYLE" '{prompt:$p,resolution:"1k",aspect_ratio:"1:1",output_format:"png",background_color:{rgb:[230,237,240]}}')
resp=$(curl -sS -X POST https://api.higgsfield.ai/recraft/v4.1/text-to-image \
  -H "Authorization: Key $HF_API_KEY_ID" -H "Content-Type: application/json" \
  -H "Idempotency-Key: epicasia-$name-$try-$(date +%s)" -d "$body")
url=$(echo "$resp" | jq -r '.status_url // empty')
[ -z "$url" ] && { echo "$name: submit failed: $resp"; exit 1; }
for i in $(seq 1 90); do
  sleep 4
  st=$(curl -sS -H "Authorization: Key $HF_API_KEY_ID" "$url")
  s=$(echo "$st" | jq -r .status)
  case $s in
    completed) img=$(echo "$st" | jq -r '.images[0].url'); curl -sS -o "$OUT/$name-$try.png" "$img"; echo "$name: ok -> $OUT/$name-$try.png"; exit 0;;
    failed|nsfw|canceled) echo "$name: $s $st"; exit 1;;
  esac
done
echo "$name: timeout"; exit 1
