import * as pdfjsLib from '/vendor/pdfjs/pdf.mjs';

pdfjsLib.GlobalWorkerOptions.workerSrc = '/vendor/pdfjs/pdf.worker.mjs';

const POLL_INTERVAL_MS = 2000;

const screens = {
  networkSetup: document.getElementById('network-setup-screen'),
  unpaired: document.getElementById('unpaired-screen'),
  connecting: document.getElementById('connecting-screen'),
  player: document.getElementById('player-screen'),
};
const qrImg = document.getElementById('qr');
const ipEl = document.getElementById('ip');
const connectingDetail = document.getElementById('connecting-detail');
const unpairedHint = document.getElementById('unpaired-local-hint');
const connectingHint = document.getElementById('connecting-local-hint');
const networkSsidEl = document.getElementById('network-ssid');
const networkPasswordEl = document.getElementById('network-password');
const networkUrlEl = document.getElementById('network-url');
const stage = document.getElementById('stage');
const ticker = document.getElementById('ticker');
const tickerText = document.getElementById('ticker-text');

function showScreen(name) {
  for (const [key, el] of Object.entries(screens)) el.hidden = key !== name;
}

// --- Rotation state --------------------------------------------------------
// Deliberately hard-cut, no crossfade (see README) — one item on stage at a time,
// torn down completely before the next one mounts. `playlistKey` lets repeated /state
// polls (every 2s) that report the *same* playlist leave a mid-rotation item alone
// instead of restarting it from scratch on every tick.
let playlistKey = null;
let activeItems = [];
let currentIndex = 0;
let advanceTimer = null;
let clockTimer = null; // the 'clock' item's setInterval — not a <video>/<canvas>, so teardownStage's generic child.remove() wouldn't stop it on its own.
let generation = 0; // bumped whenever rotation is torn down, so late async work (a PDF page render, a video's `ended`) from a previous item can no-op instead of racing the new one.

function teardownStage() {
  clearTimeout(advanceTimer);
  advanceTimer = null;
  clearInterval(clockTimer);
  clockTimer = null;
  // Video no longer lives in the DOM (see playNativeVideo) — mpv runs as its own
  // process outside the browser, so tearing the stage down doesn't touch it on its
  // own. Called unconditionally and fire-and-forget on every transition (including
  // away from a non-video item, and every natural video-ended advance) since it's a
  // harmless no-op when nothing's playing — the one thing that must never happen is
  // a generation change mid-video leaving mpv running on top of whatever mounts next.
  fetch('/native-video/stop', { method: 'POST' }).catch(() => {});
  for (const child of [...stage.children]) {
    child.remove();
  }
}

function scheduleAdvance(seconds, myGeneration) {
  advanceTimer = setTimeout(() => {
    if (myGeneration !== generation) return;
    currentIndex = (currentIndex + 1) % activeItems.length;
    playItem(currentIndex);
  }, seconds * 1000);
}

const NATIVE_VIDEO_POLL_MS = 500;

// mpv runs and loops entirely outside the browser (see mpvPlayer.ts) — this just
// starts it, polls until it's done, and advances the rotation exactly like the
// ended-event handlers the old in-page <video> element used. Single-item rotation
// (forced content, or any playlist that just happens to have one video) loops
// correctly for free: playItem(currentIndex) calling back into here starts mpv on the
// same file again, no special-case restart-in-place logic needed like the old
// Chromium path required.
async function playNativeVideo(item, myGeneration) {
  let token;
  try {
    const res = await fetch('/native-video/play', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: item.url }),
    });
    ({ token } = await res.json());
  } catch {
    // Local agent unreachable — bail out silently; the next /state poll (which hits
    // the same agent) will surface it via the connecting screen if it's really down.
    return;
  }
  if (myGeneration !== generation) {
    fetch('/native-video/stop', { method: 'POST' }).catch(() => {});
    return;
  }

  await new Promise((resolve) => {
    const check = async () => {
      if (myGeneration !== generation) return resolve();
      try {
        const res = await fetch(`/native-video/status/${token}`);
        const data = await res.json();
        if (!data.playing) return resolve();
      } catch {
        // transient — keep polling rather than treating one failed check as "done"
      }
      setTimeout(check, NATIVE_VIDEO_POLL_MS);
    };
    void check();
  });

  if (myGeneration !== generation) return;
  currentIndex = (currentIndex + 1) % activeItems.length;
  playItem(currentIndex);
}

async function playPdf(item, myGeneration) {
  const doc = await pdfjsLib.getDocument({ url: item.url }).promise;
  const pageCount = Math.max(1, item.pageCount ?? doc.numPages);
  const perPageSeconds = item.duration ?? 8;

  for (let pageNum = 1; pageNum <= pageCount; pageNum++) {
    if (myGeneration !== generation) return;
    const page = await doc.getPage(Math.min(pageNum, doc.numPages));
    if (myGeneration !== generation) return;

    const viewport = page.getViewport({ scale: 1 });
    const scale = Math.min(window.innerWidth / viewport.width, window.innerHeight / viewport.height);
    const scaledViewport = page.getViewport({ scale });

    const canvas = document.createElement('canvas');
    canvas.width = scaledViewport.width;
    canvas.height = scaledViewport.height;
    teardownStage();
    if (myGeneration !== generation) return;
    stage.appendChild(canvas);

    await page.render({ canvasContext: canvas.getContext('2d'), viewport: scaledViewport }).promise;
    if (myGeneration !== generation) return;

    await new Promise((resolve) => {
      advanceTimer = setTimeout(resolve, perPageSeconds * 1000);
    });
    if (myGeneration !== generation) return;
  }

  if (myGeneration === generation) {
    currentIndex = (currentIndex + 1) % activeItems.length;
    playItem(currentIndex);
  }
}

function playItem(index) {
  const myGeneration = generation;
  teardownStage();
  const item = activeItems[index];
  if (!item) {
    const empty = document.createElement('div');
    empty.className = 'empty';
    empty.textContent = 'No content scheduled';
    stage.appendChild(empty);
    return;
  }

  if (item.type === 'image') {
    const img = document.createElement('img');
    img.src = item.url;
    img.onload = () => scheduleAdvance(item.duration ?? 8, myGeneration);
    stage.appendChild(img);
  } else if (item.type === 'video') {
    // Hardware-decoded via mpv, running as a separate process outside the browser
    // entirely (see mpvPlayer.ts) — replaces the old in-page <video> element, which
    // was capped at software decode on this hardware (signage-kiosk.service's
    // --disable-accelerated-video-decode documents why: Chromium's own hardware
    // decode silently stalled mid-video on real hardware). The stage stays empty;
    // mpv paints its own fullscreen surface on top of this page via cage.
    void playNativeVideo(item, myGeneration);
  } else if (item.type === 'pdf') {
    void playPdf(item, myGeneration);
  } else if (item.type === 'clock') {
    // No file, no item.url — just the current time of day on the black #stage
    // background, ticking every second until scheduleAdvance rotates it out like
    // any other timed item (image/PDF page).
    const el = document.createElement('div');
    el.className = 'clock';
    const tick = () => {
      const d = new Date();
      const pad = (n) => String(n).padStart(2, '0');
      el.textContent = `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
    };
    tick();
    clockTimer = setInterval(tick, 1000);
    stage.appendChild(el);
    scheduleAdvance(item.duration ?? 8, myGeneration);
  } else {
    // Announcements never appear in the main rotation (server-side filtered), but
    // skip defensively rather than getting stuck if one ever does.
    scheduleAdvance(0.1, myGeneration);
  }
}

function renderPlayerState(state) {
  showScreen('player');

  ticker.hidden = !state.announcement.on;
  tickerText.textContent = state.announcement.text ?? '';

  const key = state.items.map((i) => i.id).join(',');
  if (key === playlistKey) return; // same playlist as last poll — leave the current item alone

  playlistKey = key;
  activeItems = state.items;
  currentIndex = 0;
  generation++;
  playItem(0);
}

// --- Polling -----------------------------------------------------------------

// Wraps an uploaded fallback file (see localContent.ts) as a fake single-item
// player state so it reuses playItem/renderPlayerState as-is — including the
// hardened single-video restart-in-place path, which nothing here needs to
// duplicate. Only shown when there's genuinely no hub content to fall back on
// (see pollOnce below) — the moment the hub has real state again, it wins.
function localContentState(item) {
  return { items: [item], announcement: { on: false, text: null } };
}

async function pollOnce() {
  try {
    const res = await fetch('/state');
    const data = await res.json();
    const localUrl = data.ip ? `http://${data.ip}:8088/network-setup.html` : null;

    if (data.networkSetup) {
      // Takes priority over everything else: while broadcasting its own fallback
      // network (see wifiManager.ts) there's no real LAN for the control app — or
      // a phone visiting this Pi's own IP for local content — to reach this Pi on,
      // so nothing below applies until this resolves.
      playlistKey = null;
      networkSsidEl.textContent = data.networkSetup.ssid ?? '—';
      networkPasswordEl.textContent = data.networkSetup.password ?? '—';
      networkUrlEl.textContent = data.networkSetup.url ?? '—';
      showScreen('networkSetup');
    } else if (!data.paired && data.localContent) {
      renderPlayerState(localContentState(data.localContent));
    } else if (!data.paired) {
      playlistKey = null;
      ipEl.textContent = data.ip ?? 'unknown';
      qrImg.src = '/qr.png';
      if (unpairedHint) unpairedHint.textContent = localUrl ? `Fail-safe: open ${localUrl} on your phone to upload content directly to this display.` : '';
      showScreen('unpaired');
    } else if (!data.state && data.localContent) {
      // Paired but nothing usable from the hub yet (down, unreachable, wrong IP) —
      // deliberately NOT reached while a stale-but-real state is still cached (see
      // poller.ts), since resuming last-known-good content already covers that case.
      renderPlayerState(localContentState(data.localContent));
    } else if (!data.state) {
      playlistKey = null;
      connectingDetail.textContent = data.error ? `Last error: ${data.error}` : '';
      if (connectingHint) connectingHint.textContent = localUrl ? `Fail-safe: open ${localUrl} on your phone to upload content directly to this display.` : '';
      showScreen('connecting');
    } else {
      renderPlayerState(data.state);
    }
  } catch (err) {
    connectingDetail.textContent = `Local agent unreachable: ${err}`;
    showScreen('connecting');
  } finally {
    setTimeout(pollOnce, POLL_INTERVAL_MS);
  }
}

pollOnce();
