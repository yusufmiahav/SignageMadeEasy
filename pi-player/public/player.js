import * as pdfjsLib from '/vendor/pdfjs/pdf.mjs';

pdfjsLib.GlobalWorkerOptions.workerSrc = '/vendor/pdfjs/pdf.worker.mjs';

const POLL_INTERVAL_MS = 2000;

const screens = {
  unpaired: document.getElementById('unpaired-screen'),
  connecting: document.getElementById('connecting-screen'),
  player: document.getElementById('player-screen'),
};
const qrImg = document.getElementById('qr');
const ipEl = document.getElementById('ip');
const connectingDetail = document.getElementById('connecting-detail');
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
let generation = 0; // bumped whenever rotation is torn down, so late async work (a PDF page render, a video's `ended`) from a previous item can no-op instead of racing the new one.

function teardownStage() {
  clearTimeout(advanceTimer);
  advanceTimer = null;
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
    const video = document.createElement('video');
    video.src = item.url;
    video.autoplay = true;
    video.muted = true;
    video.playsInline = true;
    if (activeItems.length === 1) {
      // Sole item in the active list — always true for forced content, and also
      // true for any playlist/event that just happens to contain one video. Loop
      // natively instead of tearing the stage down and remounting a fresh <video>
      // on every pass via the onended->playItem path below: native looping just
      // seeks back to 0 with no reload, which is what actually makes a single-video
      // screen play smoothly instead of flickering every loop.
      video.loop = true;
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

async function pollOnce() {
  try {
    const res = await fetch('/state');
    const data = await res.json();

    if (!data.paired) {
      playlistKey = null;
      ipEl.textContent = data.ip ?? 'unknown';
      qrImg.src = '/qr.png';
      showScreen('unpaired');
    } else if (!data.state) {
      playlistKey = null;
      connectingDetail.textContent = data.error ? `Last error: ${data.error}` : '';
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
