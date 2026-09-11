// Android/other browser-only screen player — see hub/README.md's "Android /
// browser-only screens" section. No local agent, no config file: this page's own
// URL (/screen/<deviceId>) is the only "pairing" state that exists, and it polls
// the hub directly (same origin, so no hubUrl to configure) instead of a local
// agent proxying that poll the way pi-player/public/player.js does. Deliberately a
// much smaller feature set than the Pi player — image/video + the announcement
// ticker only (see hub/README.md for exactly why: no local process to run a native
// NDI/PDF renderer, and TfL/clock were left out for this device type's initial
// scope, not because either would need one).

const POLL_INTERVAL_MS = 5000; // matches pi-player/src/poller.ts's real hub-facing cadence (not that player.js's separate 2s *local* poll — there's no local agent here to proxy through)
const MEDIA_CACHE = 'signage-media-v1';

const deviceId = location.pathname.split('/').filter(Boolean).pop();
const LAST_STATE_KEY = `signageBrowserPlayer.lastState.${deviceId}`;

const screens = {
  connecting: document.getElementById('connecting-screen'),
  player: document.getElementById('player-screen'),
};
const connectingDetail = document.getElementById('connecting-detail');
const stage = document.getElementById('stage');
const ticker = document.getElementById('ticker');
const tickerText = document.getElementById('ticker-text');

function showScreen(name) {
  for (const [key, el] of Object.entries(screens)) el.hidden = key !== name;
}

// --- Local resilience layer ---------------------------------------------------
// Two independent layers, both explicitly requested (not just "poll live"): a
// persisted last-known-good PlayerState survives a full page/device reload with no
// network at all (a plain in-memory variable wouldn't survive that, only a network
// blip within one page lifetime); the Cache Storage API below persists the actual
// media bytes so that resumed state can still render without hitting the network.
function saveLastState(state) {
  try { localStorage.setItem(LAST_STATE_KEY, JSON.stringify(state)); } catch { /* storage full/unavailable — falls back to live-only */ }
}
function loadLastState() {
  try {
    const raw = localStorage.getItem(LAST_STATE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

// Fire-and-forget: downloads any image/video not yet cached at its current URL.
// Mirrors pi-player/src/mediaCache.ts's warm()/isCurrent() shape (a URL change for
// a known id is a cache miss, same reasoning as there), but keyed by the browser's
// own Cache Storage instead of a local file, and actively pruned (below) since a
// browser's storage quota, unlike a Pi's SD card, isn't something this project
// already treats as unbounded.
async function warmMedia(items) {
  const cache = await caches.open(MEDIA_CACHE);
  const keep = new Set();
  for (const item of items) {
    if ((item.type !== 'image' && item.type !== 'video') || !item.url) continue;
    keep.add(item.url);
    if (await cache.match(item.url)) continue;
    try {
      const res = await fetch(item.url);
      if (res.ok) await cache.put(item.url, res);
    } catch { /* network down right now — next warmMedia() call (every poll tick) retries */ }
  }
  // Prune anything cached that isn't in the current playlist at all — a browser's
  // storage quota makes this worth doing, unlike mediaCache.ts's deliberately
  // unbounded on-disk cache.
  for (const req of await cache.keys()) {
    if (!keep.has(req.url)) await cache.delete(req);
  }
}

// Resolves the actual src to hand a fresh <img>/<video> — cached bytes via an
// object URL when available (works with no network at all), otherwise the hub's
// own URL directly (warmMedia will have it cached by the next poll either way).
async function resolveSrc(item) {
  try {
    const cache = await caches.open(MEDIA_CACHE);
    const cached = await cache.match(item.url);
    if (cached) return URL.createObjectURL(await cached.blob());
  } catch { /* Cache Storage unavailable for some reason — fall through to live URL */ }
  return item.url;
}

// --- Rotation state (mirrors pi-player/public/player.js's shape, image/video only) ---
let playlistKey = null;
let activeItems = [];
let activeKind = 'default';
let currentIndex = 0;
let advanceTimer = null;
let generation = 0;
let currentObjectUrl = null; // revoked in teardownStage so resolveSrc's object URLs don't leak over a long uptime

function teardownStage() {
  clearTimeout(advanceTimer);
  advanceTimer = null;
  if (currentObjectUrl) {
    URL.revokeObjectURL(currentObjectUrl);
    currentObjectUrl = null;
  }
  for (const child of [...stage.children]) {
    if (child instanceof HTMLVideoElement) {
      child.pause();
      child.removeAttribute('src');
      child.load();
    }
    child.remove();
  }
}

function scheduleAdvance(seconds, myGeneration) {
  advanceTimer = setTimeout(() => {
    if (myGeneration !== generation) return;
    currentIndex = (currentIndex + 1) % activeItems.length;
    void playItem(currentIndex);
  }, seconds * 1000);
}

async function playItem(index) {
  const myGeneration = generation;
  teardownStage();
  const item = activeItems[index];
  if (!item) {
    if (activeKind !== 'blackout') {
      const empty = document.createElement('div');
      empty.className = 'empty';
      empty.textContent = 'No content scheduled';
      stage.appendChild(empty);
    }
    return;
  }

  const src = await resolveSrc(item);
  if (myGeneration !== generation) {
    // A newer poll already tore this down while resolveSrc's cache lookup was
    // in flight — release the object URL resolveSrc may have just created rather
    // than mounting it on a stage nothing else will ever clean up.
    if (src.startsWith('blob:')) URL.revokeObjectURL(src);
    return;
  }
  if (src.startsWith('blob:')) currentObjectUrl = src;

  if (item.type === 'image') {
    const img = document.createElement('img');
    img.src = src;
    img.onload = () => scheduleAdvance(item.duration ?? 8, myGeneration);
    img.onerror = () => scheduleAdvance(item.duration ?? 8, myGeneration); // don't get stuck on a broken/uncached image
    stage.appendChild(img);
  } else if (item.type === 'video') {
    const video = document.createElement('video');
    video.src = src;
    video.autoplay = true;
    video.muted = false;
    video.playsInline = true;

    if (activeItems.length === 1) {
      // Sole item in rotation — restart in place instead of tearing the stage down
      // on every loop, same reasoning (and the same real-hardware-tested approach)
      // as pi-player/public/player.js's own sole-video case: native `loop` and a
      // bare play() call after a rejected promise both proved unreliable there.
      let restartToken = 0;
      const restartVideo = (attempt) => {
        if (myGeneration !== generation) return;
        const myToken = ++restartToken;
        video.currentTime = 0;
        const played = video.play();
        if (played && typeof played.catch === 'function') {
          played.catch(() => {
            if (myGeneration !== generation || myToken !== restartToken) return;
            if (attempt < 3) setTimeout(() => restartVideo(attempt + 1), 300);
            else void playItem(currentIndex); // give up, fall back to a full remount
          });
        }
        setTimeout(() => {
          if (myGeneration !== generation || myToken !== restartToken) return;
          if (video.paused || video.currentTime < 0.1) {
            if (attempt < 3) restartVideo(attempt + 1);
            else void playItem(currentIndex);
          }
        }, 2000);
      };
      video.onended = () => restartVideo(0);
    } else {
      video.onended = () => {
        if (myGeneration !== generation) return;
        currentIndex = (currentIndex + 1) % activeItems.length;
        void playItem(currentIndex);
      };
    }
    stage.appendChild(video);
  } else {
    // Anything else (announcement, or a content type this device type doesn't
    // render — clock/NDI/TfL/PDF) never appears in the main rotation server-side
    // filtered for 'announcement', but skip defensively rather than getting stuck.
    scheduleAdvance(0.1, myGeneration);
  }
}

function renderPlayerState(state) {
  showScreen('player');

  ticker.hidden = !state.announcement.on;
  tickerText.textContent = state.announcement.text ?? '';

  const key = `${state.kind}:${state.items.map((i) => i.id).join(',')}`;
  if (key === playlistKey) return; // same playlist as last poll — leave the current item alone

  playlistKey = key;
  activeItems = state.items;
  activeKind = state.kind;
  currentIndex = 0;
  generation++;
  void playItem(0);
}

// --- Polling --------------------------------------------------------------
let lastSafetyHold = true;

async function pollOnce() {
  try {
    const res = await fetch(`/api/player/${deviceId}/state`, { signal: AbortSignal.timeout(4000) });
    if (res.status === 404) {
      connectingDetail.textContent = 'This screen was removed from the control app.';
      showScreen('connecting');
      playlistKey = null;
      return;
    }
    if (!res.ok) throw new Error(`hub responded ${res.status}`);
    const state = await res.json();
    lastSafetyHold = state.safetyHold;
    saveLastState(state);
    if (lastSafetyHold) void warmMedia(state.items);
    renderPlayerState(state);
  } catch (err) {
    if (playlistKey === null) {
      // Nothing rendered yet this page load (no live poll has ever succeeded) — try
      // the persisted last-known-good state, which survives a full reload/device
      // reboot with no network at all, unlike pi-player/src/poller.ts's equivalent
      // in-memory-only fallback. Its own safetyHold value governs here, not the
      // lastSafetyHold default, since nothing live has been fetched yet to know
      // better than what was last actually resolved.
      const fallback = loadLastState();
      if (fallback && fallback.safetyHold) {
        lastSafetyHold = true;
        renderPlayerState(fallback);
      } else {
        lastSafetyHold = fallback ? fallback.safetyHold : true;
        connectingDetail.textContent = `Hub unreachable: ${err}`;
        showScreen('connecting');
      }
    } else if (!lastSafetyHold) {
      // Safety hold off and a live poll had previously succeeded — a disconnected
      // screen should go blank, not freeze on stale content (matches poller.ts).
      playlistKey = null;
      activeItems = [];
      teardownStage();
      showScreen('player');
      ticker.hidden = true;
    }
    // else: safety hold on and already showing something from a previous
    // successful poll — leave it exactly as-is.
  } finally {
    // Heartbeat piggybacks on the same tick, independent of whether the state fetch
    // above succeeded — mirrors pi-player/src/poller.ts. Deliberately sends no `ip`
    // field: the hub's own heartbeat route already falls back to the request's real
    // source IP (req.ip) when the body doesn't provide one, which is exactly what's
    // wanted here since this page has no way to determine its own LAN-visible IP
    // the way a Node process on the Pi can.
    fetch(`/api/devices/${deviceId}/heartbeat`, { method: 'POST', signal: AbortSignal.timeout(4000) }).catch(() => {});
    setTimeout(pollOnce, POLL_INTERVAL_MS);
  }
}

pollOnce();
