import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

function formatDuration(seconds: number): string {
  const s = Math.round(seconds);
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return `${m}:${String(rem).padStart(2, '0')}`;
}

/** Shells out to ffprobe (installed alongside ffmpeg in the hub's Docker image). */
export async function getVideoDuration(filePath: string): Promise<string> {
  try {
    const { stdout } = await execFileAsync('ffprobe', [
      '-v', 'error',
      '-show_entries', 'format=duration',
      '-of', 'default=noprint_wrappers=1:nokey=1',
      filePath,
    ]);
    const seconds = parseFloat(stdout.trim());
    return Number.isFinite(seconds) ? formatDuration(seconds) : '0:00';
  } catch {
    return '0:00';
  }
}
