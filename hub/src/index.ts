import { createApp } from './app.js';
import { startPolling } from './tflStatus.js';

const PORT = Number(process.env.PORT ?? 4000);

const app = createApp();
app.listen(PORT, () => {
  console.log(`SignageMadeEasy hub listening on :${PORT}`);
});

// Started here (the real process entrypoint), not inside createApp() — createApp()
// can be constructed more than once (e.g. by a future test suite) and this interval
// should only ever run once per actual hub process.
startPolling();
