import { createApp } from './app.js';
import { loadConfig } from './config.js';
import { startPolling } from './poller.js';

const PORT = Number(process.env.PORT ?? 8088);

if (loadConfig()) startPolling();

const app = createApp();
app.listen(PORT, () => {
  console.log(`SignageMadeEasy player agent listening on :${PORT}`);
});
