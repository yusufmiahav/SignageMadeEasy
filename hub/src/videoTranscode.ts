import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs';

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

async function getVideoDimensions(filePath: string): Promise<{ width: number; height: number } | null> {
  try {
    const { stdout } = await execFileAsync('ffprobe', [
      '-v', 'error',
      '-select_streams', 'v:0',
      '-show_entries', 'stream=width,height',
      '-of', 'csv=s=x:p=0',
      filePath,
    ]);
    const [width, height] = stdout.trim().split('x').map(Number);
    return Number.isFinite(width) && Number.isFinite(height) ? { width, height } : null;
  } catch {
    return null;
  }
}

/**
 * True if the source's longer side exceeds MAX_WIDTH and therefore worth capping;
 * false if it's already small enough or its dimensions couldn't be read (leave it
 * alone rather than risk a bad transcode). Checks the longer side rather than
 * literally "width" so a portrait video (height > width) is judged by the
 * dimension that actually drives decode cost — a 2002x3552 portrait upload has a
 * "width" of only 2002, comfortably under a naive 1280 width check, while its real
 * long side (3552) is nearly double a 1920x1080 source already confirmed to be too
 * much for a Pi 3B+'s software decoder.
 */
export async function needsCapping(filePath: string): Promise<boolean> {
  const dims = await getVideoDimensions(filePath);
  return dims != null && Math.max(dims.width, dims.height) > MAX_WIDTH;
}

/**
 * Downscales `sourcePath` to `destPath` — never overwrites the original, since some
 * screens (see Device.videoQuality) are meant to keep playing the full-resolution
 * upload instead. Runs as a background job from routes/library.ts, off the upload
 * request's response path — a large source video can take real time to re-encode
 * even on hardware far more capable than the Pi this protects, so the caller isn't
 * meant to block on it. Audio, if any, is copied untouched; only the video stream is
 * re-encoded. Returns whether it succeeded.
 */
export async function transcodeToCapped(sourcePath: string, destPath: string): Promise<boolean> {
  try {
    const dims = await getVideoDimensions(sourcePath);
    // Cap whichever side is actually the long one to MAX_WIDTH, letting ffmpeg
    // compute the other side to preserve aspect ratio — `scale=WIDTH:-2` alone
    // assumes landscape input (width is the long side); for a portrait video
    // (height > width) that only shrinks the already-short side and leaves the
    // real long side (height) uncapped, producing a "capped" file with MORE total
    // pixels than the exact 1920x1080 reference this cap exists to protect
    // against (confirmed on a real Pi 3B+: e.g. a 2002x3552 source "capped" this
    // way came out 1280x2272 — 2.9M px/frame vs 1080p's 2.07M).
    const scaleFilter = dims && dims.height > dims.width ? `scale=-2:${MAX_WIDTH}` : `scale=${MAX_WIDTH}:-2`;
    await execFileAsync('ffmpeg', [
      '-y',
      '-i', sourcePath,
      '-vf', scaleFilter,
      '-c:v', 'libx264',
      '-preset', 'veryfast',
      '-crf', '23',
      '-c:a', 'copy',
      destPath,
    ], { timeout: 10 * 60 * 1000 });
    return true;
  } catch {
    // Transcode failed for any reason (corrupt input, unsupported codec, timeout) —
    // fall back to serving the original upload rather than losing it entirely.
    fs.rmSync(destPath, { force: true });
    return false;
  }
}
