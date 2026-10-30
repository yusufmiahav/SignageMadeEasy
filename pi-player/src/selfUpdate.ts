// Backs the Settings screen's "Update" and "Re-provision" buttons.
//
// On Linux, the player app runs as the non-root `signage` user (see
// signage-player.service), so pulling new code, rebuilding, or re-provisioning
// needs a narrow, fixed-command sudo grant — same pattern as underclock.ts's
// set-underclock.sh. Both target scripts live in pi-player/bin/ (source-controlled)
// and are installed to /opt/signage/bin/ by provision.sh, root-owned so the
// signage user granted sudo on them can't also edit what it's allowed to run as
// root.
//
// On Windows there's no equivalent privilege-separated service user to begin
// with (see windows/install.ps1 — the kiosk Task Scheduler entry just runs as
// whatever account is logged in), so this runs windows/self-update.ps1 and
// windows/reprovision.ps1 directly via powershell.exe, no sudo-style permission
// check needed.
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const execFileAsync = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const SELF_UPDATE_SCRIPT = process.env.SIGNAGE_SELF_UPDATE_SCRIPT ?? '/opt/signage/bin/self-update.sh';
const REPROVISION_SCRIPT = process.env.SIGNAGE_REPROVISION_SCRIPT ?? '/opt/signage/bin/reprovision.sh';
const WINDOWS_SELF_UPDATE_SCRIPT = process.env.SIGNAGE_SELF_UPDATE_SCRIPT ?? path.resolve(__dirname, '../windows/self-update.ps1');
const WINDOWS_REPROVISION_SCRIPT = process.env.SIGNAGE_REPROVISION_SCRIPT ?? path.resolve(__dirname, '../windows/reprovision.ps1');

const NOT_BOOTSTRAPPED_LINUX =
  "This screen hasn't been set up for remote updates yet — SSH in and re-run provision.sh once (see pi-player/README.md), then try again.";
const NOT_BOOTSTRAPPED_WINDOWS =
  "This screen's install is missing its windows/ scripts — re-run install.ps1 once (see pi-player/README.md), then try again.";

// A Pi that hasn't been re-provisioned since this feature shipped has neither the
// script nor the sudoers grant yet. `sudo -n -l <script>` reports whether this
// exact command is permitted without actually running it, and without prompting
// for a password it has no way to supply (-n) — so a not-yet-bootstrapped Pi
// reports a clear, actionable error immediately instead of the button silently
// doing nothing for a minute.
async function canRun(scriptPath: string): Promise<boolean> {
  try {
    await execFileAsync('sudo', ['-n', '-l', scriptPath]);
    return true;
  } catch {
    return false;
  }
}

function runPowershell(scriptPath: string): void {
  execFileAsync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', scriptPath]).catch(() => {});
}

// Fire-and-forget past the permission check: both scripts eventually restart (or,
// for reprovision, reboot) this very process, so there's nothing meaningful left
// to await once they're underway — same reasoning as app.ts's /system/reboot route.
export async function triggerUpdate(): Promise<void> {
  if (process.platform === 'win32') {
    if (!fs.existsSync(WINDOWS_SELF_UPDATE_SCRIPT)) throw new Error(NOT_BOOTSTRAPPED_WINDOWS);
    runPowershell(WINDOWS_SELF_UPDATE_SCRIPT);
    return;
  }
  if (!(await canRun(SELF_UPDATE_SCRIPT))) throw new Error(NOT_BOOTSTRAPPED_LINUX);
  execFileAsync('sudo', [SELF_UPDATE_SCRIPT]).catch(() => {});
}

export async function triggerReprovision(): Promise<void> {
  if (process.platform === 'win32') {
    if (!fs.existsSync(WINDOWS_REPROVISION_SCRIPT)) throw new Error(NOT_BOOTSTRAPPED_WINDOWS);
    runPowershell(WINDOWS_REPROVISION_SCRIPT);
    return;
  }
  if (!(await canRun(REPROVISION_SCRIPT))) throw new Error(NOT_BOOTSTRAPPED_LINUX);
  execFileAsync('sudo', [REPROVISION_SCRIPT]).catch(() => {});
}
