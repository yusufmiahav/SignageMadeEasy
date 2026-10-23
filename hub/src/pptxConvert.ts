import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, readdir, rename, rm } from 'node:fs/promises';
import path from 'node:path';
import { UPLOADS_DIR } from './db.js';

const execFileAsync = promisify(execFile);

/**
 * Converts a PowerPoint file to PDF via headless LibreOffice, so an uploaded .pptx/.ppt
 * can be stored and played back as a plain 'pdf' library item — reusing the existing
 * PDF pipeline (countPdfPages, page-by-page rotation on the Pi) with no new item type.
 * LibreOffice only lets you choose an output *directory*; it names the result after
 * the input's own basename, so this converts into a scratch directory under
 * UPLOADS_DIR (same filesystem as destPath, so the final move is a plain rename, not
 * a cross-device copy) and moves the single PDF it produces into place. Returns
 * whether it succeeded.
 */
export async function convertPptxToPdf(sourcePath: string, destPath: string): Promise<boolean> {
  const scratchDir = await mkdtemp(path.join(UPLOADS_DIR, '.pptx-convert-'));
  try {
    await execFileAsync('soffice', [
      '--headless',
      '--convert-to', 'pdf',
      '--outdir', scratchDir,
      sourcePath,
    ], { timeout: 5 * 60 * 1000 });
    const produced = (await readdir(scratchDir)).find((f) => f.endsWith('.pdf'));
    if (!produced) return false;
    await rename(path.join(scratchDir, produced), destPath);
    return true;
  } catch {
    return false;
  } finally {
    await rm(scratchDir, { recursive: true, force: true });
  }
}
