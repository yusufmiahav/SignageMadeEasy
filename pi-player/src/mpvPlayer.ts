import fs from 'node:fs';
import net from 'node:net';
import { spawn, type ChildProcess } from 'node:child_process';

// Hardware-decoded video via mpv, replacing Chromium's in-page <video> element (see
// player.js) — that path was fundamentally capped at software decode on this
// hardware: signage-kiosk.service's --disable-accelerated-video-decode flag documents
// a real-hardware finding that Chromium's own V4L2 hardware decode silently stalled
// mid-video at a fixed point every time. mpv uses the same kernel V4L2 M2M driver, so
// that risk doesn't disappear — it's mitigated below with a playback-position watchdog
// that kills and respawns mpv if it ever stops advancing, mirroring the same
// bounded-retry-then-move-on philosophy player.js already used for the old Chromium
// video path. This module owns spawning mpv, talking to it over its JSON IPC socket,
// and reporting a simple playing/not-playing status app.ts's /native-video/* routes
// expose to the polling player.js page.

// Overridable without a redeploy — a real-hardware fallback if hardware decode turns
// out to hang here the way it did in Chromium: SIGNAGE_MPV_HWDEC=no forces software
// decode (still native/full-screen via mpv, just not GPU-accelerated) with a single
// systemd `Environment=` edit + restart, no code change needed.
const HWDEC = process.env.SIGNAGE_MPV_HWDEC ?? 'v4l2m2m-copy';
const IPC_SOCKET = process.env.SIGNAGE_MPV_SOCKET ?? '/tmp/signage-mpv.sock';

// How long mpv's reported playback position is allowed to stop advancing before it's
// treated as a stall and killed/respawned. Generous on purpose — mpv buffering a large
// local file for a moment is normal and shouldn't trigger a restart.
const STALL_TIMEOUT_MS = 8000;
const POSITION_POLL_MS = 1500;
const MAX_STALL_RESTARTS = 3;

interface PlaybackState {
  token: number;
  playing: boolean;
  ended: boolean;
}

let nextToken = 0;
let current: PlaybackState | null = null;
let currentProc: ChildProcess | null = null;

/**
 * cage stacks additional Wayland clients fullscreen "on top" of whatever's already
 * running (confirmed via cage's own docs, not this project's real hardware — that
 * part still needs a real-device check) rather than refusing a second client, so mpv
 * just needs to connect to the same compositor socket Chromium is already using. That
 * socket isn't at a fixed path: it lives under the signage user's XDG runtime
 * directory, named wayland-N. Player agent and kiosk are separate systemd units (the
 * agent starts first — see signage-player.service's ordering — so it can't just
 * inherit a WAYLAND_DISPLAY Chromium was handed at its own startup), so this looks the
 * socket up fresh on every launch instead of assuming a fixed value.
 */
function findWaylandDisplay(): { xdgRuntimeDir: string; waylandDisplay: string } | null {
  const uid = process.getuid?.();
  if (uid == null) return null;
  const dir = `/run/user/${uid}`;
  try {
    const candidates = fs.readdirSync(dir).filter((f) => /^wayland-\d+$/.test(f));
    if (candidates.length === 0) return null;
    // Highest-numbered socket wins — guards against a stale leftover from a previous
    // crashed compositor still sitting at wayland-0 while the current cage is on
    // wayland-1 after a restart.
    candidates.sort();
    return { xdgRuntimeDir: dir, waylandDisplay: candidates[candidates.length - 1] };
  } catch {
    return null;
  }
}

async function waitForWaylandDisplay(timeoutMs: number): Promise<{ xdgRuntimeDir: string; waylandDisplay: string }> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const found = findWaylandDisplay();
    if (found) return found;
    if (Date.now() >= deadline) throw new Error('no Wayland display found (cage not up yet?)');
    await new Promise((r) => setTimeout(r, 250));
  }
}

/**
 * Minimal client for mpv's JSON IPC protocol — newline-delimited JSON over a Unix
 * socket. Only needs get_property(time-pos), so a full client library would be more
 * than this warrants. mpv proactively pushes unsolicited event messages (e.g.
 * start-file, property-change) over the same connection regardless of whether
 * anything was requested, so this can't assume the first line it sees is the reply to
 * its own command — it has to scan every complete line and skip ones that aren't it.
 */
function queryTimePos(socketPath: string): Promise<number | null> {
  return new Promise((resolve) => {
    const sock = net.createConnection(socketPath);
    let buf = '';
    let settled = false;
    const done = (value: number | null) => {
      if (settled) return;
      settled = true;
      sock.destroy();
      resolve(value);
    };
    sock.on('connect', () => sock.write(`${JSON.stringify({ command: ['get_property', 'time-pos'] })}\n`));
    sock.on('data', (chunk) => {
      buf += chunk.toString('utf8');
      let idx: number;
      while ((idx = buf.indexOf('\n')) !== -1) {
        const line = buf.slice(0, idx);
        buf = buf.slice(idx + 1);
        if (!line) continue;
        try {
          const msg = JSON.parse(line);
          if (typeof msg.data === 'number') return done(msg.data);
        } catch {
          // malformed/unrelated line — keep scanning
        }
      }
    });
    sock.on('error', () => done(null));
    setTimeout(() => done(null), 1000);
  });
}

function killCurrentProc(): void {
  if (currentProc) {
    currentProc.kill('SIGTERM');
    setTimeout(() => currentProc?.kill('SIGKILL'), 1500);
    currentProc = null;
  }
  try {
    fs.unlinkSync(IPC_SOCKET);
  } catch {
    // already gone
  }
}

export function stop(): void {
  killCurrentProc();
  current = null;
}

/**
 * Starts (or restarts, on a stall) mpv fullscreen over whatever cage is currently
 * showing. Runs entirely in the background — callers poll isPlaying(token) rather
 * than awaiting a promise, matching this whole project's polling-based design (see
 * poller.ts, player.js's /state loop) instead of introducing a long-lived HTTP
 * connection or websocket just for this.
 */
export function play(url: string): number {
  const token = ++nextToken;
  current = { token, playing: true, ended: false };
  void runWithRestarts(url, token, 0);
  return token;
}

async function runWithRestarts(url: string, token: number, restarts: number): Promise<void> {
  if (current?.token !== token) return; // superseded by a newer play() call

  let display: { xdgRuntimeDir: string; waylandDisplay: string };
  try {
    display = await waitForWaylandDisplay(5000);
  } catch {
    if (current?.token === token) { current.playing = false; current.ended = true; }
    return;
  }
  if (current?.token !== token) return;

  killCurrentProc();

  const proc = spawn('mpv', [
    '--fullscreen',
    '--no-input-default-bindings',
    '--no-osc',
    '--osd-level=0',
    '--no-terminal',
    `--hwdec=${HWDEC}`,
    '--vo=gpu',
    '--gpu-context=wayland',
    '--loop-file=no',
    `--input-ipc-server=${IPC_SOCKET}`,
    url,
  ], {
    env: { ...process.env, XDG_RUNTIME_DIR: display.xdgRuntimeDir, WAYLAND_DISPLAY: display.waylandDisplay },
  });
  currentProc = proc;

  let exited = false;
  const exitPromise = new Promise<void>((resolve) => {
    proc.on('exit', () => { exited = true; resolve(); });
    proc.on('error', () => { exited = true; resolve(); });
  });

  // Watchdog: confirms time-pos is actually advancing, not just that the process is
  // alive — the exact failure mode documented for Chromium's hardware decode was a
  // silent stall with the process/tab still very much running.
  let lastPos: number | null = null;
  let lastAdvance = Date.now();
  const watchdog = (async () => {
    while (!exited && current?.token === token) {
      await new Promise((r) => setTimeout(r, POSITION_POLL_MS));
      if (exited || current?.token !== token) break;
      const pos = await queryTimePos(IPC_SOCKET);
      if (pos != null && (lastPos == null || pos > lastPos + 0.05)) {
        lastPos = pos;
        lastAdvance = Date.now();
      } else if (Date.now() - lastAdvance > STALL_TIMEOUT_MS) {
        killCurrentProc();
        break;
      }
    }
  })();

  await Promise.race([exitPromise, watchdog]);
  killCurrentProc(); // no-op if exitPromise already tore it down cleanly

  if (current?.token !== token) return; // superseded mid-playback

  if (!exited && restarts < MAX_STALL_RESTARTS) {
    // Stalled, not naturally finished, and retries remain — restart from scratch
    // rather than trying to resume the exact position, matching the "full
    // teardown+remount" fallback the old Chromium video path used as its own last
    // resort.
    void runWithRestarts(url, token, restarts + 1);
    return;
  }

  if (current.token === token) {
    current.playing = false;
    current.ended = true;
  }
}

export function isPlaying(token: number): boolean {
  return current?.token === token && current.playing;
}
