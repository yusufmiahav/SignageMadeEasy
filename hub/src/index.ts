import { createApp } from './app.js';
import { startPolling } from './tflStatus.js';
import * as tflArrivals from './tflArrivals.js';
import * as store from './store.js';

const PORT = Number(process.env.PORT ?? 4000);

const app = createApp();
app.listen(PORT, () => {
  console.log(`SignageMadeEasy hub listening on :${PORT}`);
});

// Started here (the real process entrypoint), not inside createApp() — createApp()
// can be constructed more than once (e.g. by a future test suite) and this interval
// should only ever run once per actual hub process.
startPolling();

// Which stations are "needed" changes as library items are added/removed, so this
// is recomputed fresh on every poll tick rather than once at startup — see
// tflArrivals.ts's startPolling for why this is a callback instead of a direct
// store.ts import (circular-import avoidance: store.ts already imports tflArrivals.ts).
tflArrivals.startPolling(() =>
  store.listLibrary()
    .filter((item): item is typeof item & { tflStopPointId: string } => item.type === 'tfl-arrivals' && !!item.tflStopPointId)
    .map((item) => item.tflStopPointId),
);
