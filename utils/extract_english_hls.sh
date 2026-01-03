#!/usr/bin/env bash
# Usage: ./extract_english_hls.sh input.mkv output_dir
# This script finds the English audio track (by language or name) and converts to HLS.

set -e

INPUT_FILE="$1"
OUTPUT_DIR="$2"
BASENAME=$(basename -- "$INPUT_FILE")
BASENAME_NOEXT="${BASENAME%.*}"

if [[ -z "$INPUT_FILE" || -z "$OUTPUT_DIR" ]]; then
  echo "Usage: $0 input.mkv output_dir"
  exit 1
fi

# Find English audio stream index (by language or name)
AUDIO_INDEX=$(ffprobe -v error -select_streams a -show_entries stream=index:stream_tags=language:stream_tags=title -of csv=p=0 "$INPUT_FILE" | \
  awk -F',' 'tolower($2)=="eng" || tolower($3)~/(english|eng)/ {print $1; exit}')

# Fallback: if not found, use first audio stream
if [[ -z "$AUDIO_INDEX" ]]; then
  AUDIO_INDEX=0
fi

echo "Using audio stream index: $AUDIO_INDEX"

mkdir -p "$OUTPUT_DIR"

ffmpeg -i "$INPUT_FILE" -map 0:v:0 -map 0:a:$AUDIO_INDEX -c:v copy -c:a aac -b:a 192k -ac 2 -f hls -hls_time 6 -hls_playlist_type vod "$OUTPUT_DIR/${BASENAME_NOEXT}.m3u8"
