import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs';
import path from 'node:path';

const execFileAsync = promisify(execFile);

// Confirmed via real-hardware testing (not a guess): a Pi 3B+ dropped roughly 65% of
// frames decoding a 1920x1080 H.264 High-profile source, even with hardware decode
// active and the display already at its correct native resolution — heat, encoding
// bitrate, and the render/compositing path were all ruled out first. The constraint
// is decode throughput at the *source* resolution, not how it's displayed, so this
// caps it once here at upload time rather than relying on every video being
// re-encoded by hand before it reaches the hub. Overridable per-deployment (e.g. once
// on Pi 4/5-class hardware, or if a screen genuinely needs sharper video) without a
// code change.
const MAX_WIDTH = Number(process.env.SIGNAGE_MAX_VIDEO_WIDTH ?? 1280);

async function getVideoWidth(filePath: string): Promise<number | null> {
  try {
    const { stdout } = await execFileAsync('ffprobe', [
      '-v', 'error',
      '-select_streams', 'v:0',
      '-show_entries', 'stream=width',
      '-of', 'default=noprint_wrappers=1:nokey=1',
      filePath,
    ]);
    const width = Number.parseInt(stdout.trim(), 10);
    return Number.isFinite(width) ? width : null;
  } catch {
    return null;
  }
}

/** Downscales in place (same path) if the source is wider than MAX_WIDTH; a no-op otherwise. Audio, if any, is copied untouched — only the video stream needs re-encoding. */
export async function capVideoResolution(filePath: string): Promise<void> {
  const width = await getVideoWidth(filePath);
  if (width == null || width <= MAX_WIDTH) return; // already small enough, or couldn't tell — leave it alone rather than risk a bad transcode

  const tmpPath = `${filePath}.transcoding${path.extname(filePath)}`;
  try {
    await execFileAsync('ffmpeg', [
      '-y',
      '-i', filePath,
      '-vf', `scale=${MAX_WIDTH}:-2`,
      '-c:v', 'libx264',
      '-preset', 'veryfast',
      '-crf', '23',
      '-c:a', 'copy',
      tmpPath,
      // A NAS is far more capable than the Pi this is protecting, but a long source
      // video still takes real time to re-encode — generous rather than tight.
    ], { timeout: 10 * 60 * 1000 });
    fs.renameSync(tmpPath, filePath);
  } catch {
    // Transcode failed for any reason (corrupt input, unsupported codec, timeout) —
    // fall back to serving the original upload rather than losing it entirely.
    fs.rmSync(tmpPath, { force: true });
  }
}
