import { createApp } from './app.js';
import { loadConfig } from './config.js';
import { startPolling } from './poller.js';
import * as mediaCache from './mediaCache.js';
import * as wifiManager from './wifiManager.js';
import * as orientationConfig from './orientationConfig.js';
import * as displayOrientation from './displayOrientation.js';

const PORT = Number(process.env.PORT ?? 8088);

mediaCache.init();
if (loadConfig()) startPolling();
wifiManager.startWatching();
// Unconditional — regardless of pairing state, so the first-boot IP/QR screen
// itself (not just content shown after pairing) renders in the right orientation.
// See displayOrientation.ts's own comment for why this retries instead of a single attempt.
void displayOrientation.applyOrientationAtBoot(orientationConfig.loadOrientation());

const app = createApp();
app.listen(PORT, () => {
  console.log(`SignageMadeEasy player agent listening on :${PORT}`);
});
