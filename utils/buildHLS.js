const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const ffmpegPath = require('@ffmpeg-installer/ffmpeg').path;
const { spawnSync } = require('child_process');

async function buildHLS(src, outDir, progressCallback) {
  // Auto-detect English audio stream index using ffprobe
  // Returns the RELATIVE audio stream index (0-based among audio streams only)
  function getEnglishAudioIndex(file) {
    try {
      const ffprobe = spawnSync('ffprobe', [
        '-v', 'error',
        '-select_streams', 'a',
        '-show_entries', 'stream=index:stream_tags=language:stream_tags=title:stream_tags=handler_name',
        '-of', 'json',
        file
      ], { encoding: 'utf8' });
      if (ffprobe.error) throw ffprobe.error;
      const out = JSON.parse(ffprobe.stdout);
      if (out.streams && out.streams.length > 0) {
        // Find the relative index (position in the audio streams array)
        // 1. By language
        let relativeIdx = out.streams.findIndex(s => (s.tags && s.tags.language && /^(eng|en)$/i.test(s.tags.language)));
        if (relativeIdx !== -1) return relativeIdx;
        // 2. By title
        relativeIdx = out.streams.findIndex(s => (s.tags && s.tags.title && /english|eng/i.test(s.tags.title)));
        if (relativeIdx !== -1) return relativeIdx;
        // 3. By handler_name
        relativeIdx = out.streams.findIndex(s => (s.tags && s.tags.handler_name && /english|eng/i.test(s.tags.handler_name)));
        if (relativeIdx !== -1) return relativeIdx;
        // 4. Fallback: first audio stream (relative index 0)
        return 0;
      }
    } catch (e) {
      console.warn('[ffprobe] Could not auto-detect English audio:', e.message);
    }
    return 0;
  }

  return new Promise((resolve, reject) => {
    const outM3U8 = path.join(outDir, "playlist.m3u8");
    const segmentPattern = path.join(outDir, "playlist%d.ts");
    
    const fileExt = path.extname(src).toLowerCase();
    const isMKV = fileExt === '.mkv';
    const isAVI = fileExt === '.avi';
    const isMP4 = fileExt === '.mp4';

    // Always re-encode MKV, AVI, and MP4 files for HLS compatibility
    if (isMKV || isAVI || isMP4) {
      console.log(`[ffmpeg] Detected ${fileExt} file, using robust re-encode for HLS compatibility`);
      const audioIndex = getEnglishAudioIndex(src);
      console.log(`[ffmpeg] Using audio stream index: ${audioIndex}`);
      const args = [
        "-i", src,
        "-sn", // disable subtitle streams
        "-map", "0:v:0",
        "-map", `0:a:${audioIndex}`,
        "-c:v", "libx264",
        "-profile:v", "main",
        "-level", "3.1",
        "-pix_fmt", "yuv420p",
        "-force_key_frames", "expr:gte(t,n_forced*2)",
        "-preset", "medium",
        "-crf", "20",
        "-threads", "2",
        "-c:a", "aac",
        "-profile:a", "aac_low",
        "-b:a", "320k",
        "-ar", "48000",
        "-ac", "2",
        "-movflags", "+faststart",
        "-max_muxing_queue_size", "9999",
        "-ignore_unknown",
        "-maxrate", "5M",
        "-bufsize", "10M",
        "-f", "hls",
        "-hls_time", "8",
        "-hls_playlist_type", "vod",
        "-hls_list_size", "0",
        "-hls_segment_filename", segmentPattern,
        outM3U8
      ];
      return runFFmpeg(args, src, outM3U8, progressCallback).then(resolve).catch(reject);
    }

    // For other formats, try copy codec first, fallback to re-encode
    const tryWithCopyCodec = () => {
      const audioIndex = getEnglishAudioIndex(src);
      console.log(`[ffmpeg] Using audio stream index: ${audioIndex}`);
      const args = [
        "-i", src,
        "-sn", // disable subtitle streams
        "-map", "0:v:0",
        "-map", `0:a:${audioIndex}`,
        "-c:v", "copy",
        "-c:a", "aac",
        "-b:a", "128k",
        "-bsf:v", "h264_mp4toannexb",
        "-movflags", "+faststart",
        "-hls_time", "6",
        "-hls_playlist_type", "vod",
        "-hls_list_size", "0",
        "-hls_segment_filename", segmentPattern,
        "-f", "hls",
        outM3U8
      ];

      console.log("[ffmpeg] Attempting HLS with video copy + audio AAC:", src, "->", outM3U8);
      return runFFmpeg(args, src, outM3U8, progressCallback);
    };

    // Fallback: re-encode both video and audio if copy codec fails
    const tryWithReencode = () => {
      const args = [
        "-i", src,
        "-c:a", "aac",
        "-profile:a", "aac_low",
        "-sn", // disable subtitle streams
        "-c:v", "libx264",
        "-c:a", "aac",
        "-b:a", "320k",
        "-ar", "48000",
        "-preset", "medium",
        "-crf", "20",
        "-threads", "2",
        "-bufsize", "10M",
        "-maxrate", "5M",
        "-movflags", "+faststart",
        "-hls_time", "6",
        "-hls_playlist_type", "vod",
        "-hls_list_size", "0",
        "-hls_segment_filename", segmentPattern,
        "-f", "hls",
        outM3U8
      ];

      console.log("[ffmpeg] Copy codec failed, re-encoding with low CPU usage:", src, "->", outM3U8);
      return runFFmpeg(args, src, outM3U8, progressCallback);
    };

    // Try copy codec first, fallback to re-encode if it fails
    tryWithCopyCodec()
      .then(resolve)
      .catch((err) => {
        console.warn("[ffmpeg] Copy codec failed:", err.message);
        console.log("[ffmpeg] Falling back to re-encoding...");
        tryWithReencode()
          .then(resolve)
          .catch(reject);
      });
  });
}

function runFFmpeg(args, src, outM3U8, progressCallback) {
  return new Promise((resolve, reject) => {
    const ff = spawn(ffmpegPath, args, { stdio: ['ignore', 'pipe', 'pipe'] });

    let duration = 0;
    let currentTime = 0;
    let ffmpegStderr = '';

    ff.stderr.on('data', (data) => {
      const output = data.toString();
      ffmpegStderr += output;
      // Extract duration from ffmpeg output
      const durationMatch = output.match(/Duration: (\d{2}):(\d{2}):(\d{2})/);
      if (durationMatch && duration === 0) {
        const hours = parseInt(durationMatch[1]);
        const minutes = parseInt(durationMatch[2]);
        const seconds = parseInt(durationMatch[3]);
        duration = hours * 3600 + minutes * 60 + seconds;
      }

      // Extract current processing time
      const timeMatch = output.match(/time=(\d{2}):(\d{2}):(\d{2})/);
      if (timeMatch && duration > 0) {
        const hours = parseInt(timeMatch[1]);
        const minutes = parseInt(timeMatch[2]);
        const seconds = parseInt(timeMatch[3]);
        currentTime = hours * 3600 + minutes * 60 + seconds;
        const progress = Math.min(100, (currentTime / duration) * 100);
        if (progressCallback) {
          progressCallback(progress);
        }
      }
    });

    ff.on("close", code => {
      if (code === 0) {
        resolve();
      } else {
        console.error(`[ffmpeg] Full stderr for failed command: ${args.join(' ')}\n${ffmpegStderr}`);
        reject(new Error("ffmpeg failed"));
      }
    });

    ff.on("error", (err) => {
      reject(new Error(`Error spawning ffmpeg: ${err.message}`));
    });
  });
}

module.exports = buildHLS