#!/usr/bin/env bash
# Usage: ./extract_english_hls_auto.sh input.mkv output_dir
# This script tries to auto-detect the English audio track by language, title, or handler_name, and converts to HLS.

set -e

INPUT_FILE="$1"
OUTPUT_DIR="$2"
BASENAME=$(basename -- "$INPUT_FILE")
BASENAME_NOEXT="${BASENAME%.*}"

if [[ -z "$INPUT_FILE" || -z "$OUTPUT_DIR" ]]; then
  echo "Usage: $0 input.mkv output_dir"
  exit 1
fi

# Get all audio stream info as JSON
AUDIO_JSON=$(ffprobe -v error -select_streams a -show_entries stream=index:stream_tags=language:stream_tags=title:stream_tags=handler_name -of json "$INPUT_FILE")

# Try to find English audio by language, title, or handler_name
AUDIO_INDEX=$(echo "$AUDIO_JSON" | \
  jq -r '.streams[] | select((.tags.language // "") | test("^(eng|en)$"; "i")) | .index' | head -n1)

if [[ -z "$AUDIO_INDEX" ]]; then
  AUDIO_INDEX=$(echo "$AUDIO_JSON" | \
    jq -r '.streams[] | select((.tags.title // "") | test("english|eng"; "i")) | .index' | head -n1)
fi

if [[ -z "$AUDIO_INDEX" ]]; then
  AUDIO_INDEX=$(echo "$AUDIO_JSON" | \
    jq -r '.streams[] | select((.tags.handler_name // "") | test("english|eng"; "i")) | .index' | head -n1)
fi

# Fallback: if not found, use first audio stream
if [[ -z "$AUDIO_INDEX" ]]; then
  AUDIO_INDEX=$(echo "$AUDIO_JSON" | jq -r '.streams[0].index')
fi

echo "Using audio stream index: $AUDIO_INDEX"

mkdir -p "$OUTPUT_DIR"

ffmpeg -i "$INPUT_FILE" -map 0:v:0 -map 0:a:$AUDIO_INDEX -c:v copy -c:a aac -b:a 192k -ac 2 -f hls -hls_time 6 -hls_playlist_type vod "$OUTPUT_DIR/${BASENAME_NOEXT}.m3u8"
