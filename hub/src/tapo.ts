import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

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

export interface DiscoveredPlug {
  host: string;
  alias?: string;
  model?: string;
  // False means found-on-the-LAN-but-couldn't-log-in (wrong saved password, or a
  // device tied to a different TP-Link account) — still surfaced with its IP
  // rather than silently dropped, see tapo-discover.py's own comment.
  reachable: boolean;
  error?: string;
}

const KASA_PYTHON = process.env.SIGNAGE_KASA_PYTHON ?? '/opt/kasa-venv/bin/python3';
// hub/scripts/, not hub/src/ — see that script's own comment for why this talks to
// python-kasa's library API directly instead of shelling out to `kasa discover`
// itself (as setPower above does for on/off) for a result shape this hub controls.
const DISCOVER_SCRIPT = path.resolve(__dirname, '../scripts/tapo-discover.py');
const BROADCAST_TIMEOUT_S = 5;
// Per-host, for the subnet sweep below — short because most of a /24 is empty and
// each miss costs this in full (UDP has no quick "connection refused" the way TCP
// does). Confirmed via real deployment: 254 hosts at this timeout, 32 at once
// (tapo-discover.py's own SWEEP_CONCURRENCY), finishes well inside this function's
// own execFile timeout below even with more than one subnet to sweep.
const PROBE_TIMEOUT_S = 1.2;

// There's no cloud/account-based device listing in python-kasa at all (confirmed by
// reading its own source) — `kasa discover` is LAN UDP broadcast only, which only
// ever finds devices on the hub's own L2 segment. Confirmed against a real
// deployment that this misses anything on a separate subnet/VLAN entirely — a
// guest Wi-Fi network in that case, which a router deliberately doesn't forward
// broadcast traffic across even though it still routes ordinary unicast there (see
// tapo-discover.py's own comment). `subnets` sweeps each given "a.b.c" /24 prefix
// directly by IP to cover that case — pass the hub's own detected subnets
// (hub/src/routes/scan.ts's localSubnets()) plus any manual hint the person gives
// (same subnetHintFromHost() Pi pairing's own "Scan network" already uses) for a
// subnet that isn't one of those.
export async function discover(email: string, password: string, subnets: string[] = []): Promise<DiscoveredPlug[]> {
  const uniqueSubnets = [...new Set(subnets)];
  // Generous but still bounded — worst case is every subnet being a fully empty
  // /24, costing PROBE_TIMEOUT_S per host through the sweep's own concurrency.
  const timeoutMs = (BROADCAST_TIMEOUT_S + uniqueSubnets.length * 15 + 10) * 1000;
  const { stdout } = await execFileAsync(
    KASA_PYTHON,
    [DISCOVER_SCRIPT, email, password, String(BROADCAST_TIMEOUT_S), String(PROBE_TIMEOUT_S), ...uniqueSubnets],
    { timeout: timeoutMs },
  );
  return JSON.parse(stdout) as DiscoveredPlug[];
}
