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
let ndiPollTimer = null; // the 'ndi' item's status-polling setInterval — see playNativeNdi.
let generation = 0; // bumped whenever rotation is torn down, so late async work (a PDF page render, a video's `ended`) from a previous item can no-op instead of racing the new one.
let tflBoardEl = null; // the currently-mounted 'tfl-status' board, if any — see syncTflLines.
let tflBoardItemId = null;
let tflArrivalsBoardEl = null; // the currently-mounted 'tfl-arrivals' board, if any — see syncTflArrivals.
let tflArrivalsBoardItemId = null;

function teardownStage() {
  clearTimeout(advanceTimer);
  advanceTimer = null;
  clearInterval(clockTimer);
  clockTimer = null;
  clearInterval(ndiPollTimer);
  ndiPollTimer = null;
  tflBoardEl = null;
  tflBoardItemId = null;
  tflArrivalsBoardEl = null;
  tflArrivalsBoardItemId = null;
  // Unconditional and fire-and-forget: a no-op on the Pi if nothing native is playing,
  // but guarantees switching away from an NDI item always kills the GStreamer process
  // rather than leaving it running underneath whatever plays next.
  void fetch('/native-ndi/stop', { method: 'POST' }).catch(() => {});
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

// Pi 4/5 or an x86 device only. NDI has no browser decoder, so there's nothing to mount on #stage —
// the native GStreamer process this starts (see ndiPlayer.ts) renders its own
// fullscreen Wayland surface on top of this page, the same architectural pattern the
// mpv-hwdecode branch uses for regular video. Rotation timing races a fixed duration
// (like image/clock) against polling /native-ndi/status for an early "process died" —
// whichever comes first advances rotation; see the project plan for why v1 has no
// richer health signal than process-alive.
//
// Sole-item case mirrors video's own restart-in-place special case (see playItem's
// video branch below): confirmed on real hardware that without this, a lone NDI item
// would tear down and respawn the GStreamer process every time its duration timer
// elapsed — "advancing" to the next item just means itself again — causing a
// periodic black flash purely from the pointless restart, not anything wrong with
// the feed itself. A live NDI source has no natural end the way a demuxed video's
// `ended` event does, so the fix is simpler than video's: just never schedule a
// duration-based restart at all when this is the only thing in rotation, and rely
// solely on crash detection (a real process death still restarts it).
function playNativeNdi(item, myGeneration) {
  const duration = item.duration ?? 8;
  const isSoleItem = activeItems.length === 1;
  const advanceOnce = () => {
    if (myGeneration !== generation) return;
    currentIndex = (currentIndex + 1) % activeItems.length;
    playItem(currentIndex);
  };

  fetch('/native-ndi/play', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ndiSourceName: item.ndiSourceName }),
  })
    .then((res) => res.json())
    .then(({ token }) => {
      if (myGeneration !== generation) return;
      if (!isSoleItem) advanceTimer = setTimeout(advanceOnce, duration * 1000);
      ndiPollTimer = setInterval(() => {
        fetch(`/native-ndi/status/${token}`)
          .then((res) => res.json())
          .then(({ playing }) => {
            if (myGeneration !== generation || playing) return;
            clearTimeout(advanceTimer);
            clearInterval(ndiPollTimer);
            advanceOnce();
          })
          .catch(() => {}); // transient poll failure — self-heals on the next tick a second later regardless
      }, 1000);
    })
    .catch((err) => {
      console.log('[signage ndi]', 'failed to start playback', err);
      if (myGeneration === generation) scheduleAdvance(duration, myGeneration);
    });
}

// TfL's official per-line brand colors (the Roundel/Overground palette), keyed by
// the line `id` the API itself returns — not the numeric statusSeverity code or a
// generic good/amber/red bucket, per explicit request to match real TfL branding.
// The classic Underground/DLR/Elizabeth line/Tram colors are TfL's long-published,
// stable brand values (high confidence). The six individual Overground line colors
// (liberty/lioness/mildmay/suffragette/weaver/windrush) are from the 2024 rebrand
// and are this file's best-effort recollection, not independently re-verified
// against TfL's brand guidelines PDF — if one looks off next to the real thing,
// it's a one-line fix here, not a structural problem.
const TFL_LINE_COLOR = {
  bakerloo: '#B36305',
  central: '#E32017',
  circle: '#FFD300',
  district: '#00782A',
  'hammersmith-city': '#F3A9BB',
  jubilee: '#A0A5A9',
  metropolitan: '#9B0056',
  northern: '#000000',
  piccadilly: '#003688',
  victoria: '#0098D4',
  'waterloo-city': '#95CDBA',
  dlr: '#00A4A7',
  elizabeth: '#6950A1',
  tram: '#84B817',
  liberty: '#676767',
  lioness: '#FFA600',
  mildmay: '#1E90CE',
  suffragette: '#52BFAB',
  weaver: '#A5498D',
  windrush: '#DA291C',
};
const TFL_LINE_COLOR_FALLBACK = '#666666'; // any line id TfL adds later that isn't in the map above yet

// TfL's brand colors span both very light (Circle yellow, Waterloo & City teal) and
// very dark (Northern black, Piccadilly navy) — a single fixed badge text color
// would be unreadable on roughly half of them. Standard relative-luminance formula
// rather than a per-line lookup, so this works correctly even for the Overground
// colors above that are this file's own best-effort guess.
function contrastTextColor(hex) {
  const r = Number.parseInt(hex.slice(1, 3), 16);
  const g = Number.parseInt(hex.slice(3, 5), 16);
  const b = Number.parseInt(hex.slice(5, 7), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.55 ? '#000' : '#fff';
}

// Buckets TfL's own statusSeverityDescription text to decide whether to show the
// reason detail line, not to pick a color (colors are per-line brand colors now,
// see TFL_LINE_COLOR above) — the exact 0-14 statusSeverity code table isn't
// documented with enough confidence to hardcode here (see hub/src/tflStatus.ts's
// header comment), but the description strings TfL already shows humans are stable.
function tflIsDisrupted(description) {
  return description !== 'Good Service';
}

function renderTflBoard(item) {
  const board = document.createElement('div');
  board.className = 'tfl-board';
  const lines = item.tflLines ?? [];
  if (lines.length === 0) {
    board.innerHTML = '<div class="tfl-empty">No TfL status available right now</div>';
    return board;
  }
  for (const line of lines) {
    const row = document.createElement('div');
    row.className = 'tfl-row';
    const badge = document.createElement('span');
    badge.className = 'tfl-line-badge';
    const badgeColor = TFL_LINE_COLOR[line.id] ?? TFL_LINE_COLOR_FALLBACK;
    badge.style.background = badgeColor;
    badge.style.color = contrastTextColor(badgeColor);
    badge.textContent = line.name;
    const statusCol = document.createElement('div');
    statusCol.className = 'tfl-status-col';
    const status = document.createElement('span');
    status.className = `tfl-status-text${tflIsDisrupted(line.statusSeverityDescription) ? ' disrupted' : ''}`;
    status.textContent = line.statusSeverityDescription;
    statusCol.appendChild(status);
    // TfL's own free-text explanation (e.g. which stations are affected) — only
    // shown when there's actually a disruption to explain; see TflLine.reason's
    // comment in hub/src/tflStatus.ts for why this is treated as optional.
    if (line.reason) {
      const reason = document.createElement('span');
      reason.className = 'tfl-reason';
      reason.textContent = line.reason;
      statusCol.appendChild(reason);
    }
    row.appendChild(badge);
    row.appendChild(statusCol);
    board.appendChild(row);
  }
  // Multi-column so a full line roster (e.g. every Tube + Overground + DLR +
  // Elizabeth line mode selected at once, ~25 lines) fits the screen instead of
  // running off the bottom — a kiosk display can't scroll, so "fits" is a hard
  // requirement, not a nice-to-have. CSS multicol (not a JS-computed grid) lets
  // each column's rows flow and wrap naturally even though disrupted rows are
  // taller than "Good Service" ones (see .tfl-row's break-inside in player.css).
  board.style.columnCount = String(Math.max(1, Math.ceil(lines.length / 6)));
  return board;
}

// "3 min", or "Due" for anything already at/under a minute out — matches how a
// real TfL platform departure board rounds (it never shows "0 min").
function formatArrivalMinutes(sec) {
  const min = Math.round(sec / 60);
  return min <= 0 ? 'Due' : `${min} min`;
}

// Departure-board rendering for 'tfl-arrivals' items — one row per platform+direction
// (already grouped server-side, see hub/src/tflArrivals.ts's getBoardForStop), reusing
// the same per-line brand-color badge as the status board (TFL_LINE_COLOR) for visual
// consistency between the two TfL content types.
function renderTflArrivalsBoard(item) {
  const board = document.createElement('div');
  board.className = 'tfl-board';
  // Names the station this board is for — every row already shows a train's
  // *destination* (e.g. "Ealing Broadway"), not the station the board itself is
  // showing arrivals at, which was genuinely ambiguous on a real render with no
  // other on-screen label. Shown in both the populated and "no arrivals" states.
  if (item.tflStopPointName) {
    const header = document.createElement('div');
    header.className = 'tfl-arrivals-header';
    header.textContent = item.tflStopPointName;
    board.appendChild(header);
  }
  const boards = item.tflArrivalBoards ?? [];
  if (boards.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'tfl-empty';
    empty.textContent = 'No arrivals available right now';
    board.appendChild(empty);
    return board;
  }
  for (const b of boards) {
    const row = document.createElement('div');
    row.className = 'tfl-row';
    const badge = document.createElement('span');
    badge.className = 'tfl-line-badge';
    const badgeColor = TFL_LINE_COLOR[b.lineId] ?? TFL_LINE_COLOR_FALLBACK;
    badge.style.background = badgeColor;
    badge.style.color = contrastTextColor(badgeColor);
    badge.textContent = b.lineName;
    const infoCol = document.createElement('div');
    infoCol.className = 'tfl-status-col';
    const towards = document.createElement('span');
    towards.className = 'tfl-status-text';
    towards.textContent = b.platformName ? `${b.towards} · ${b.platformName}` : b.towards;
    infoCol.appendChild(towards);
    const countdown = document.createElement('span');
    countdown.className = 'tfl-reason';
    const [first, ...rest] = b.arrivalsSec;
    countdown.textContent = rest.length > 0
      ? `${formatArrivalMinutes(first)}, then ${rest.map(formatArrivalMinutes).join(', ')}`
      : formatArrivalMinutes(first);
    infoCol.appendChild(countdown);
    row.appendChild(badge);
    row.appendChild(infoCol);
    board.appendChild(row);
  }
  // Same multi-column no-scroll reasoning as renderTflBoard above.
  board.style.columnCount = String(Math.max(1, Math.ceil(boards.length / 6)));
  return board;
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
  } else if (item.type === 'ndi') {
    playNativeNdi(item, myGeneration);
  } else if (item.type === 'tfl-status') {
    // No native process, no polling of its own — item.tflLines is already resolved
    // fresh by the hub on every /state poll (see hub/src/store.ts's getPlayerState).
    // Tracked in tflBoardEl/tflBoardItemId so renderPlayerState's refreshTflBoardIfShowing
    // can update the displayed line data in place on later polls while this item stays
    // on screen — the same item ids polling normally short-circuits on otherwise (see
    // renderPlayerState's playlistKey check) would mean a "live" board that never
    // actually updates until rotation happens to cycle back to it.
    const board = renderTflBoard(item);
    tflBoardEl = board;
    tflBoardItemId = item.id;
    stage.appendChild(board);
    scheduleAdvance(item.duration ?? 8, myGeneration);
  } else if (item.type === 'tfl-arrivals') {
    // Same reasoning as 'tfl-status' above — item.tflArrivalBoards is already
    // resolved fresh by the hub on every poll; tracked so syncTflArrivals can
    // update it in place while this item stays on screen.
    const board = renderTflArrivalsBoard(item);
    tflArrivalsBoardEl = board;
    tflArrivalsBoardItemId = item.id;
    stage.appendChild(board);
    scheduleAdvance(item.duration ?? 8, myGeneration);
  } else {
    // Announcements never appear in the main rotation (server-side filtered), but
    // skip defensively rather than getting stuck if one ever does.
    scheduleAdvance(0.1, myGeneration);
  }
}

// A 'tfl-status' item's line data is resolved fresh by the hub on every poll (see
// hub/src/store.ts's getPlayerState), but its id never changes — so the playlistKey
// check below, which exists to leave a mid-rotation item alone across identical
// polls, would otherwise mean a "live" board that never actually updates until
// rotation happens to cycle back to it. Runs on every poll regardless of whether
// the key changed, and does two things: (1) if this item is the one currently on
// screen, updates its rendered board in place without touching rotation/generation
// state; (2) replaces the (possibly now-stale) entry in `activeItems` so a later
// rotation cycle back to this same item — which reuses that array, not a fresh
// server response, since the key won't have changed either — replays current data
// instead of whatever was first polled.
function syncTflLines(state) {
  if (activeItems.length === 0) return;
  const freshById = new Map(state.items.filter((i) => i.type === 'tfl-status').map((i) => [i.id, i]));
  if (freshById.size === 0) return;
  for (let i = 0; i < activeItems.length; i++) {
    const fresh = freshById.get(activeItems[i].id);
    if (fresh) activeItems[i] = fresh;
  }
  if (tflBoardEl && tflBoardItemId && freshById.has(tflBoardItemId)) {
    tflBoardEl.replaceChildren(...renderTflBoard(freshById.get(tflBoardItemId)).childNodes);
  }
}

// Mirrors syncTflLines above, for 'tfl-arrivals' items — arrivals are minutes away
// (not hours, like line status), so this matters even more here: without it, a
// board left on screen across multiple polls would show the same stale countdowns
// until rotation happened to cycle back to it.
function syncTflArrivals(state) {
  if (activeItems.length === 0) return;
  const freshById = new Map(state.items.filter((i) => i.type === 'tfl-arrivals').map((i) => [i.id, i]));
  if (freshById.size === 0) return;
  for (let i = 0; i < activeItems.length; i++) {
    const fresh = freshById.get(activeItems[i].id);
    if (fresh) activeItems[i] = fresh;
  }
  if (tflArrivalsBoardEl && tflArrivalsBoardItemId && freshById.has(tflArrivalsBoardItemId)) {
    tflArrivalsBoardEl.replaceChildren(...renderTflArrivalsBoard(freshById.get(tflArrivalsBoardItemId)).childNodes);
  }
}

function renderPlayerState(state) {
  showScreen('player');

  ticker.hidden = !state.announcement.on;
  tickerText.textContent = state.announcement.text ?? '';
  syncTflLines(state);
  syncTflArrivals(state);

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

// --- Identify flash ----------------------------------------------------------
// Settings screen's "Identify" button (bulb icon) — helps a technician standing in
// front of a wall of screens match a physical display to its entry in the control
// app. Drawn as an overlay on top of #stage rather than touching rotation/teardown
// state at all, so it works regardless of what's currently playing (including the
// unpaired/connecting screens) without interrupting it. One exception: while a
// native NDI item is on screen, its own separate Wayland surface (see ndiPlayer.ts)
// occludes this browser page entirely, so the flash won't be visible then — a known,
// low-priority gap for what's still a rare content type.
let lastFlashToken = null;

function triggerIdentifyFlash() {
  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed; inset:0; z-index:9999; pointer-events:none; background:#fff;';
  document.body.appendChild(overlay);

  const PHASE_MS = 250;
  const phases = ['#000', '#fff', '#000']; // starts on #fff (already applied above): white, black, white, black
  let i = 0;
  const tick = () => {
    if (i >= phases.length) {
      overlay.remove();
      return;
    }
    overlay.style.background = phases[i++];
    setTimeout(tick, PHASE_MS);
  };
  setTimeout(tick, PHASE_MS);
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

    // Checked unconditionally, before the screen-state branching below, so identify
    // works no matter what's currently showing. Skips the very first poll after page
    // load (lastFlashToken starts null) so an old token from before this page loaded
    // doesn't trigger a spurious flash.
    if (lastFlashToken !== null && data.flashToken !== lastFlashToken) triggerIdentifyFlash();
    lastFlashToken = data.flashToken;

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
