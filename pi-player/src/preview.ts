// Backs the Settings screen's "Preview" button — a live screenshot of exactly what's
// currently rendering on this screen, for confirming content without walking over to
// look at it. Chromium is already launched with its remote-debugging port open (see
// sway-kiosk.config's --remote-debugging-port=9222) purely so this Pi's own local
// requests can reach it — captured here via the Chrome DevTools Protocol rather than
// a Wayland-level screenshot tool (e.g. grim), which isn't installed by provision.sh
// and would need extra packaging just for this.
import WebSocket from 'ws';

// A dual-output unit runs a SECOND Chromium kiosk window for output 2, pinned to
// its own physical connector (see provision.sh's sway-kiosk.config generation) —
// it needs its own --remote-debugging-port too, since two separate Chromium
// processes can't share one. Output 1's port is unchanged from before dual-output
// existed.
const DEVTOOLS_PORTS: Record<1 | 2, number> = { 1: 9222, 2: 9223 };
const CAPTURE_TIMEOUT_MS = 5000;

interface DevtoolsTarget {
  type: string;
  webSocketDebuggerUrl: string;
}

export async function captureScreenshot(output: 1 | 2 = 1): Promise<Buffer> {
  const listRes = await fetch(`http://localhost:${DEVTOOLS_PORTS[output]}/json/list`);
  if (!listRes.ok) throw new Error(`DevTools target list failed: ${listRes.status}`);
  const targets = (await listRes.json()) as DevtoolsTarget[];
  // The kiosk is a single full-screen page (see sway-kiosk.config's --kiosk
  // http://localhost:8088) — this is always that one page, not a picker.
  const page = targets.find((t) => t.type === 'page');
  if (!page) throw new Error('No page target open in Chromium');

  return new Promise((resolve, reject) => {
    const ws = new WebSocket(page.webSocketDebuggerUrl);
    const timer = setTimeout(() => {
      ws.terminate();
      reject(new Error('DevTools screenshot timed out'));
    }, CAPTURE_TIMEOUT_MS);

    const finish = (err: Error | null, buffer?: Buffer) => {
      clearTimeout(timer);
      ws.close();
      if (err) reject(err);
      else resolve(buffer!);
    };

    ws.on('open', () => {
      ws.send(JSON.stringify({ id: 1, method: 'Page.captureScreenshot', params: { format: 'jpeg', quality: 70 } }));
    });
    ws.on('message', (data) => {
      const msg = JSON.parse(data.toString()) as { id?: number; result?: { data: string }; error?: { message: string } };
      if (msg.id !== 1) return;
      if (msg.error) finish(new Error(msg.error.message));
      else finish(null, Buffer.from(msg.result!.data, 'base64'));
    });
    ws.on('error', (err) => finish(err));
  });
}
