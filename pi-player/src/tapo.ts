import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

// Turns a TP-Link Tapo smart plug on this Pi's own LAN on/off — see
// hub/src/piAgent.ts's tapoSetPower, which calls into this via POST /tapo/power
// below. No maintained Node library exists for Tapo's local (non-cloud) control
// protocol; python-kasa is the actively-developed reference implementation other
// reimplementations cite, so this shells out to its bundled `kasa` CLI the same way
// this project already shells out to ffmpeg/LibreOffice elsewhere, rather than
// hand-porting the KLAP handshake into TypeScript. See pi-player/provision.sh for
// how `kasa` gets installed (pipx, not a bare system-wide pip install).
const execFileAsync = promisify(execFile);
const TIMEOUT_MS = 15000;
// Absolute path, not a bare `kasa` relying on $PATH — provision.sh installs
// python-kasa into its own dedicated venv (not a system-wide pip install, which
// Raspberry Pi OS Bookworm blocks outright — see provision.sh's own comment on
// this), so the binary isn't necessarily on this process's PATH at all regardless
// of which user/environment the agent ends up running under.
const KASA_BIN = process.env.SIGNAGE_KASA_BIN ?? '/opt/signage/venv/bin/kasa';

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
