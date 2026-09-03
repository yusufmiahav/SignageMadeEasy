import { spawn, type ChildProcess } from 'node:child_process';
import { waitForWaylandDisplay, XDG_RUNTIME_DIR } from './waylandDisplay.js';

// Pi 4/5 only. NDI has no browser decoder, so a live NDI source is rendered by a
// native GStreamer process (gst-launch-1.0 + the community gst-plugin-ndi) spawned as
// a second fullscreen Wayland client alongside cage/Chromium — the same architectural
// shape as the mpv-hwdecode branch's native video player, but a wholly separate
// implementation: no IPC socket (ndisrc has its own internal reconnect logic and there's
// no confirmed "frozen but alive" failure mode yet to watch for — see the project plan
// for why v1 sticks to process-alive checking only), and gst-launch-1.0 instead of mpv
// (which has no NDI protocol support at all).

const GST_LAUNCH_BIN = process.env.SIGNAGE_GST_LAUNCH_BIN ?? 'gst-launch-1.0';
const NDI_FIND_BIN = process.env.SIGNAGE_NDI_FIND_BIN ?? '/opt/signage/bin/ndi-find';
const WAYLAND_WAIT_MS = 10_000;
const NDI_FIND_TIMEOUT_MS = 4_000;

interface CurrentPlayback {
  token: number;
  ndiSourceName: string;
  proc: ChildProcess | null;
  alive: boolean;
  respawned: boolean;
}

let current: CurrentPlayback | null = null;
let nextToken = 1;

function pipelineArgs(ndiSourceName: string): string[] {
  return [
    '-e',
    'ndisrc', `ndi-name=${ndiSourceName}`, '!',
    'ndisrcdemux', 'name=d',
    // sync=false — confirmed on real Pi 5 hardware: waylandsink's default clock-synced
    // rendering drops most incoming frames ("A lot of buffers are being dropped") since
    // ndisrc's buffer timestamps don't line up with the pipeline clock the way a
    // demuxed file's would. Rendering each frame as it arrives instead of pacing to a
    // clock is the standard fix for this class of live network source.
    'd.video', '!', 'queue', '!', 'videoconvert', '!', 'waylandsink', 'fullscreen=true', 'sync=false',
  ];
}

async function spawnProcess(playback: CurrentPlayback): Promise<void> {
  const waylandDisplay = await waitForWaylandDisplay(WAYLAND_WAIT_MS);
  // Still the active playback for this token? An intervening stop()/play() while we
  // were waiting for the compositor socket means this spawn is now stale — bail out
  // without touching whatever's current now.
  if (current?.token !== playback.token) return;
  if (!waylandDisplay) {
    playback.alive = false;
    return;
  }

  const proc = spawn(GST_LAUNCH_BIN, pipelineArgs(playback.ndiSourceName), {
    env: { ...process.env, XDG_RUNTIME_DIR, WAYLAND_DISPLAY: waylandDisplay },
    stdio: 'ignore',
  });
  playback.proc = proc;
  playback.alive = true;

  proc.on('exit', () => {
    if (current?.token !== playback.token) return; // already superseded by stop()/play()
    playback.alive = false;
    // One bounded respawn attempt for a crash mid-rotation — mirrors the mpv branch's
    // own bounded-retry-then-give-up behavior. Rotation timing itself (see player.js)
    // doesn't wait on this; it just advances early if isPlaying() goes false first.
    if (!playback.respawned) {
      playback.respawned = true;
      void spawnProcess(playback);
    }
  });
  proc.on('error', () => {
    // Covers ENOENT (gst-launch-1.0 not installed) — same "not built/installed yet"
    // class of failure findSources() surfaces for the discovery helper below.
    if (current?.token === playback.token) playback.alive = false;
  });
}

/** Starts (or replaces) native NDI playback. Returns a generation token — see isPlaying(). */
export function play(ndiSourceName: string): number {
  stop();
  const token = nextToken++;
  const playback: CurrentPlayback = { token, ndiSourceName, proc: null, alive: true, respawned: false };
  current = playback;
  void spawnProcess(playback);
  return token;
}

/** False once this token's process has exited (and any bounded respawn also failed) or been superseded by a newer play()/stop() call. */
export function isPlaying(token: number): boolean {
  return current?.token === token && current.alive;
}

export function stop(): void {
  if (current?.proc && !current.proc.killed) current.proc.kill();
  current = null;
}

/**
 * Runs the small NDI discovery helper (built manually from the NDI SDK — see
 * pi-player/README.md) for its fixed discovery window and returns the source names it
 * printed, one per line. Throws a clear, distinguishable error if the helper hasn't
 * been built/installed yet, so callers (app.ts's /native-ndi/sources route) can
 * surface "discovery helper missing" rather than a bare spawn failure.
 */
export function findSources(): Promise<string[]> {
  return new Promise((resolve, reject) => {
    const proc = spawn(NDI_FIND_BIN, []);
    let stdout = '';
    proc.stdout?.on('data', (chunk: Buffer) => { stdout += chunk.toString('utf8'); });
    proc.on('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'ENOENT') reject(new Error(`NDI discovery helper not found at ${NDI_FIND_BIN} — see pi-player/README.md for building it`));
      else reject(err);
    });
    proc.on('exit', () => {
      resolve(stdout.split('\n').map((line) => line.trim()).filter(Boolean));
    });
    // The helper waits ~4s internally for NDI's own discovery to settle then exits on
    // its own; this is just a safety net in case it hangs for some other reason.
    setTimeout(() => { if (!proc.killed) proc.kill(); }, NDI_FIND_TIMEOUT_MS + 4000);
  });
}
