import { createApp } from './app.js';
import { loadConfig } from './config.js';
import { startPolling } from './poller.js';
import * as mediaCache from './mediaCache.js';
import * as wifiManager from './wifiManager.js';

const PORT = Number(process.env.PORT ?? 8088);

mediaCache.init();
if (loadConfig()) startPolling();
wifiManager.startWatching();

const app = createApp();
app.listen(PORT, () => {
  console.log(`SignageMadeEasy player agent listening on :${PORT}`);
});
