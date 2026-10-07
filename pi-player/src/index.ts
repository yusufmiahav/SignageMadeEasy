import { createApp } from './app.js';
import { loadConfig } from './config.js';
import { startPolling } from './poller.js';
import * as mediaCache from './mediaCache.js';
import * as wifiManager from './wifiManager.js';
import * as orientationConfig from './orientationConfig.js';
import * as displayOrientation from './displayOrientation.js';

const PORT = Number(process.env.PORT ?? 8088);

mediaCache.init();
// Independently — a dual-output unit may have one, both, or (freshly provisioned,
// not yet paired) neither output configured; each resumes polling only if its own
// config.json/config-output2.json exists (see config.ts). A single-output Pi only
// ever has output 1's file, so this is exactly the original behavior for it.
if (loadConfig(1)) startPolling(1);
if (loadConfig(2)) startPolling(2);
wifiManager.startWatching();
// Unconditional — regardless of pairing state, so the first-boot IP/QR screen
// itself (not just content shown after pairing) renders in the right orientation.
// See displayOrientation.ts's own comment for why this retries instead of a single attempt.
void displayOrientation.applyOrientationAtBoot(orientationConfig.loadOrientation());

const app = createApp();
app.listen(PORT, () => {
  console.log(`SignageMadeEasy player agent listening on :${PORT}`);
});
