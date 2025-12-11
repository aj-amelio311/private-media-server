const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const ffmpegPath = require('@ffmpeg-installer/ffmpeg').path;

function buildHLS(src, outDir, progressCallback) {
  return new Promise((resolve, reject) => {
    const outM3U8 = path.join(outDir, "playlist.m3u8");
    const segmentPattern = path.join(outDir, "playlist%d.ts");
    
    const fileExt = path.extname(src).toLowerCase();
    const isMKV = fileExt === '.mkv';
    const isAVI = fileExt === '.avi';
    
    // MKV and AVI files need re-encoding, others can try copy first
    if (isMKV || isAVI) {
      console.log(`[ffmpeg] Detected ${fileExt} file, using robust re-encode for HLS compatibility`);
      const args = [
        "-i", src,
        "-map", "0:v:0?",
        "-map", "0:a:0?",
        "-c:v", "libx264",
        "-profile:v", "main",
        "-level", "3.1",
        "-pix_fmt", "yuv420p",
        "-vf", "yadif", // deinterlace if needed
        "-force_key_frames", "expr:gte(t,n_forced*2)",
        "-preset", "medium",
        "-crf", "21",
        "-threads", "1",
        "-c:a", "aac",
        "-b:a", "128k",
        "-ar", "44100",
        "-ac", "2",
        "-movflags", "+faststart",
        "-max_muxing_queue_size", "1024",
        "-f", "hls",
        "-hls_time", "8",
        "-hls_playlist_type", "vod",
        "-hls_list_size", "0",
        "-hls_segment_filename", segmentPattern,
        outM3U8
      ];
      return runFFmpeg(args, src, outM3U8, progressCallback).then(resolve).catch(reject);
    }
    
    // Try with copy codec first for other formats
    const tryWithCopyCodec = () => {
      const args = [
        "-i", src,
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
        "-c:v", "libx264",
        "-c:a", "aac",
        "-b:a", "128k",
        "-preset", "ultrafast",
        "-crf", "28",
        "-threads", "2",
        "-bufsize", "1M",
        "-maxrate", "2M",
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

    ff.stderr.on('data', (data) => {
      const output = data.toString();
      
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
      code === 0 ? resolve() : reject(new Error("ffmpeg failed"));
    });

    ff.on("error", (err) => {
      reject(new Error(`Error spawning ffmpeg: ${err.message}`));
    });
  });
}

module.exports = buildHLS