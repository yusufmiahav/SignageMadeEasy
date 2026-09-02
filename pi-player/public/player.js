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
let activeKind = 'default'; // 'blackout' | 'forced' | 'event' | 'default' — see playItem's !item branch
let currentIndex = 0;
let advanceTimer = null;
let clockTimer = null; // the 'clock' item's setInterval — not a <video>/<canvas>, so teardownStage's generic child.remove() wouldn't stop it on its own.
let generation = 0; // bumped whenever rotation is torn down, so late async work (a PDF page render, a video's `ended`) from a previous item can no-op instead of racing the new one.

function teardownStage() {
  clearTimeout(advanceTimer);
  advanceTimer = null;
  clearInterval(clockTimer);
  clockTimer = null;
  for (const child of [...stage.children]) {
    if (child instanceof HTMLVideoElement) {
      child.pause();
      child.removeAttribute('src');
      child.load();
    }
    child.remove();
  }
}

// Preloading ------------------------------------------------------------------
// Warms the browser's cache for the *next* item in rotation while the current one is
// still showing, so by the time playItem() actually switches to it, the fetch+decode
// is already done instead of happening cold in front of the viewer — visible as a
// brief flash of #stage's black background while an <img> loads fresh. Doesn't touch
// the "hard cut, no crossfade" swap itself, just makes the swap fast.
const preloaded = new Map(); // item id -> Image, kept alive so it isn't GC'd mid-load
const PRELOAD_CACHE_LIMIT = 5; // bounded so a long-running rotation doesn't accumulate forever

function preloadUpcoming(index) {
  if (activeItems.length < 2) return; // nothing else to get ahead of
  const next = activeItems[(index + 1) % activeItems.length];
  if (!next || next.type !== 'image' || preloaded.has(next.id)) return;
  const img = new Image();
  img.src = next.url;
  preloaded.set(next.id, img);
  if (preloaded.size > PRELOAD_CACHE_LIMIT) {
    preloaded.delete(preloaded.keys().next().value);
  }
}

function scheduleAdvance(seconds, myGeneration) {
  advanceTimer = setTimeout(() => {
    if (myGeneration !== generation) return;
    currentIndex = (currentIndex + 1) % activeItems.length;
    playItem(currentIndex);
  }, seconds * 1000);
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
  preloadUpcoming(index);
  const item = activeItems[index];
  if (!item) {
    // Both a genuinely empty default playlist and an active blackout resolve to no
    // items, but they need to look different: blackout is a deliberate emergency
    // "nothing shows here" state (see hub/src/store.ts's activeContentIds), so it
    // stays plain black with no text — the "empty" message is only for the
    // unconfigured case, where a visible hint actually helps whoever's looking at it.
    if (activeKind !== 'blackout') {
      const empty = document.createElement('div');
      empty.className = 'empty';
      empty.textContent = 'No content scheduled';
      stage.appendChild(empty);
    }
    return;
  }

  if (item.type === 'image') {
    const img = document.createElement('img');
    img.src = item.url;
    img.onload = () => scheduleAdvance(item.duration ?? 8, myGeneration);
    stage.appendChild(img);
  } else if (item.type === 'video') {
    const video = document.createElement('video');
    video.src = item.url;
    video.autoplay = true;
    video.muted = false;
    video.playsInline = true;

    // Diagnostics for the DevTools console (--remote-debugging-port=9222, see
    // signage-kiosk.service) — three real-hardware fixes for video looping have
    // failed in a row (native `loop` froze, an explicit restart paused instead
    // of resuming, a play()-rejection retry+fallback still froze) and none of
    // them reproduce in this project's sandbox, so surfacing exactly what the
    // video element itself reports beats guessing a fourth theory blind.
    const log = (msg) => console.log(`[signage video ${item.id}]`, msg, {
      readyState: video.readyState, networkState: video.networkState,
      paused: video.paused, currentTime: video.currentTime,
      error: video.error && { code: video.error.code, message: video.error.message },
    });
    video.onerror = () => log('error event');
    video.onstalled = () => log('stalled event');
    video.onwaiting = () => log('waiting event');

    if (activeItems.length === 1) {
      // Sole item in the active list — always true for forced content, and also
      // true for any playlist/event that just happens to contain one video.
      // Restart in place instead of tearing the stage down and remounting a fresh
      // <video> on every pass via the onended->playItem path below (that's what
      // makes multi-item rotation flicker every loop on a single-video screen).
      // Deliberately NOT the native `loop` attribute — froze on the last frame
      // instead of restarting on real hardware.
      //
      // Two layers of recovery, since a rejected play() promise turned out not
      // to be the only real-hardware failure mode: (1) retry a rejected play()
      // a few times with a short delay: (2) a watchdog that checks — regardless
      // of whether play() ever rejected — that currentTime actually advanced
      // shortly after restarting, since play() can resolve successfully while
      // the video still doesn't visually progress. Either layer failing enough
      // times falls back to the same full teardown+remount path multi-item
      // rotation already uses, which has never been reported broken, even
      // though it means a visible reload instead of a seamless restart.
      // Bumped on every restartVideo call so a stale watchdog from an earlier
      // attempt can tell it's been superseded and no-op instead of misreading a
      // legitimate newer restart's fresh currentTime=0 as its own attempt having
      // stalled — a real false positive this hit in testing with a short clip
      // that naturally loops again before the previous watchdog's timer fires.
      let restartToken = 0;
      const restartVideo = (attempt) => {
        if (myGeneration !== generation) return;
        const myToken = ++restartToken;
        log(`restarting, attempt ${attempt}`);
        video.currentTime = 0;
        const played = video.play();
        if (played && typeof played.catch === 'function') {
          played.catch(() => {
            if (myGeneration !== generation || myToken !== restartToken) return;
            log(`play() rejected, attempt ${attempt}`);
            if (attempt < 3) setTimeout(() => restartVideo(attempt + 1), 300);
            else { log('giving up after 3 rejected play() attempts, falling back to remount'); playItem(currentIndex); }
          });
        }
        setTimeout(() => {
          if (myGeneration !== generation || myToken !== restartToken) return;
          if (video.paused || video.currentTime < 0.1) {
            log(`stalled after restart (attempt ${attempt}) despite play() not rejecting`);
            if (attempt < 3) restartVideo(attempt + 1);
            else { log('giving up after 3 stalled attempts, falling back to remount'); playItem(currentIndex); }
          }
        }, 2000);
      };
      video.onended = () => restartVideo(0);
    } else {
      video.onended = () => {
        if (myGeneration !== generation) return;
        currentIndex = (currentIndex + 1) % activeItems.length;
        playItem(currentIndex);
      };
    }
    stage.appendChild(video);
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

  // Includes kind, not just item ids: an empty defaultPlaylist and an active
  // blackout both resolve to zero items (same id-based key otherwise), but
  // render differently — see playItem's !item branch — so a transition between
  // the two has to be detected here too, not just a change in the item list.
  const key = `${state.kind}:${state.items.map((i) => i.id).join(',')}`;
  if (key === playlistKey) return; // same playlist as last poll — leave the current item alone

  playlistKey = key;
  activeItems = state.items;
  activeKind = state.kind;
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
  return { kind: 'default', items: [item], announcement: { on: false, text: null } };
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
