import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

// Turns a TP-Link Tapo smart plug on/off — see tapoPower.ts (manual "Power cycle")
// and tapoSchedule.ts (the once-a-minute recurring sweep), both of which call this
// directly. Runs HERE, on the hub, not on the Pi each screen is attached to: the hub
// already reaches every Pi's own agent directly over the LAN (network_mode: host —
// see docker-compose.yml), and a Tapo plug is no different, so there's no reason to
// also install this on every single Pi and keep it installed there across
// re-provisions. (An earlier version of this feature did exactly that — it meant a
// brand-new screen, or any screen that hadn't been re-provisioned since, silently
// had no working Tapo support until someone remembered to re-provision it.)
//
// No maintained Node library exists for Tapo's local (non-cloud) control protocol;
// python-kasa is the actively-developed reference implementation other
// reimplementations cite, so this shells out to its bundled `kasa` CLI the same way
// this hub already shells out to ffmpeg/LibreOffice elsewhere, rather than
// hand-porting the KLAP handshake into TypeScript. See hub/Dockerfile for how
// `kasa` gets installed (its own venv, not a bare system-wide pip install).
const execFileAsync = promisify(execFile);
const TIMEOUT_MS = 15000;
// Absolute path, not a bare `kasa` relying on $PATH — see hub/Dockerfile's own
// comment on why this lives in a dedicated venv rather than being pip-installed
// system-wide.
const KASA_BIN = process.env.SIGNAGE_KASA_BIN ?? '/opt/kasa-venv/bin/kasa';

export async function setPower(plugIp: string, email: string, password: string, on: boolean): Promise<void> {
  await execFileAsync(KASA_BIN, [
    '--host', plugIp,
    '--username', email,
    '--password', password,
    // `--type smart` connects directly, no discovery — confirmed directly (not just
    // from docs): the older `--device-family SMART.TAPOPLUG` flag it replaces still
    // parses, but silently falls back to a slow ~10s broadcast-discovery scan
    // instead of connecting straight to --host, even though the host is right there.
    '--type', 'smart',
    on ? 'on' : 'off',
  ], { timeout: TIMEOUT_MS });
}
