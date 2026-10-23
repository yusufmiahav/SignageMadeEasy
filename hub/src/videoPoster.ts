import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs';

const execFileAsync = promisify(execFile);

// A real frame from the video, not just its file-type icon, for the control app's
// preview boxes (Home's device cards, Library grid, content pickers) — the same
// treatment an image upload already gets via its own `thumb`. Scaled down since
// this is only ever shown small; -ss before -i is a fast (keyframe-seek) grab, not a
// full decode from the start, so this is cheap enough to run inline with the upload
// rather than needing its own background-job tracking like transcodeToCapped.
async function grabFrame(sourcePath: string, destPath: string, atSeconds: number): Promise<boolean> {
  try {
    await execFileAsync('ffmpeg', [
      '-y',
      '-ss', String(atSeconds),
      '-i', sourcePath,
      '-frames:v', '1',
      '-vf', 'scale=480:-2',
      '-q:v', '4',
      destPath,
    ], { timeout: 30_000 });
    return fs.existsSync(destPath) && fs.statSync(destPath).size > 0;
  } catch {
    return false;
  }
}

/** One second in avoids a pure-black/fade-in opening frame on most videos; a clip shorter than that (or whose first second happens to be black anyway) falls back to the very first frame rather than failing outright. */
export async function extractPosterFrame(sourcePath: string, destPath: string): Promise<boolean> {
  if (await grabFrame(sourcePath, destPath, 1)) return true;
  return grabFrame(sourcePath, destPath, 0);
}
