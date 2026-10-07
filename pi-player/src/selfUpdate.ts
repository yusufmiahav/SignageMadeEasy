// Backs the Settings screen's "Update" and "Re-provision" buttons. The player app
// runs as the non-root `signage` user (see signage-player.service), so pulling new
// code, rebuilding, or re-provisioning needs a narrow, fixed-command sudo grant —
// same pattern as underclock.ts's set-underclock.sh. Both target scripts live in
// pi-player/bin/ (source-controlled) and are installed to /opt/signage/bin/ by
// provision.sh, root-owned so the signage user granted sudo on them can't also
// edit what it's allowed to run as root.
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const SELF_UPDATE_SCRIPT = process.env.SIGNAGE_SELF_UPDATE_SCRIPT ?? '/opt/signage/bin/self-update.sh';
const REPROVISION_SCRIPT = process.env.SIGNAGE_REPROVISION_SCRIPT ?? '/opt/signage/bin/reprovision.sh';

const NOT_BOOTSTRAPPED =
  "This screen hasn't been set up for remote updates yet — SSH in and re-run provision.sh once (see pi-player/README.md), then try again.";

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

// Fire-and-forget past the permission check: both scripts eventually restart (or,
// for reprovision, reboot) this very process, so there's nothing meaningful left
// to await once they're underway — same reasoning as app.ts's /system/reboot route.
export async function triggerUpdate(): Promise<void> {
  if (!(await canRun(SELF_UPDATE_SCRIPT))) throw new Error(NOT_BOOTSTRAPPED);
  execFileAsync('sudo', [SELF_UPDATE_SCRIPT]).catch(() => {});
}

export async function triggerReprovision(): Promise<void> {
  if (!(await canRun(REPROVISION_SCRIPT))) throw new Error(NOT_BOOTSTRAPPED);
  execFileAsync('sudo', [REPROVISION_SCRIPT]).catch(() => {});
}
