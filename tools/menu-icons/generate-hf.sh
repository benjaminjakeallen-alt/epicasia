#!/usr/bin/env bash
# Generate one menu icon with the Higgsfield API.
# usage: [MODEL=grok|zimage|qwen|recraft] [OUT=dir] generate-hf.sh <name> "<subject>" [try]
# Auth: HF_API_KEY_ID alone (no separate secret). Never echo it.
set -euo pipefail
name=$1; subject=$2; try=${3:-1}
OUT=${OUT:-.}; MODEL=${MODEL:-grok}
STYLE="Hyper-realistic 3D miniature of ${subject}, finely detailed with real materials and fine surface wear, isolated studio product shot, the object alone floating with nothing under it, soft hazy golden morning light, gentle pastel palette of warm stone beige, cream, pale sky blue and muted sage green (#4f7a5c) accents, three-quarter view from slightly above, centered with generous empty margin, single object, pure white background, no ground, no cast shadow, no clouds, no text, no people, square."
case $MODEL in
  recraft) ep=recraft/v4.1/text-to-image
    body=$(jq -n --arg p "$STYLE" '{prompt:$p,resolution:"1k",aspect_ratio:"1:1",output_format:"png",background_color:{rgb:[255,255,255]}}');;
  zimage) ep=z-image/turbo
    body=$(jq -n --arg p "$STYLE" '{prompt:$p,resolution:"1k",aspect_ratio:"1:1"}');;
  qwen) ep=alibaba/qwen-image-3/text-to-image
    body=$(jq -n --arg p "$STYLE" '{prompt:$p,aspect_ratio:"1:1"}');;
  grok) ep=xai/grok-imagine-image-2.0
    body=$(jq -n --arg p "$STYLE" '{prompt:$p,quality:"medium",resolution:"1k",aspect_ratio:"1:1"}');;
  *) echo "unknown MODEL $MODEL"; exit 2;;
esac
auth="Authorization: Key $HF_API_KEY_ID"
resp=$(curl -sS -X POST "https://api.higgsfield.ai/$ep" -H "$auth" -H "Content-Type: application/json" \
  -H "Idempotency-Key: epicasia-$MODEL-$name-$try-$(date +%s)" -d "$body")
url=$(echo "$resp" | jq -r '.status_url // empty')
[ -z "$url" ] && { echo "$name: submit failed: $resp"; exit 1; }
for i in $(seq 1 100); do
  sleep 4
  st=$(curl -sS -H "$auth" "$url")
  case $(echo "$st" | jq -r .status) in
    completed) curl -sS -o "$OUT/$name-$MODEL-$try.png" "$(echo "$st" | jq -r '.images[0].url')"
      echo "$name: ok -> $OUT/$name-$MODEL-$try.png"; exit 0;;
    failed|nsfw|canceled) echo "$name: $st"; exit 1;;
  esac
done
echo "$name: timeout"; exit 1
