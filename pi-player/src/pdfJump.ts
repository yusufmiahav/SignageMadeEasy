// Backs the control app's remote "jump to page" control for a PDF item (see
// DevicePreviewDialog.tsx) — same "token changed since last poll" pattern as
// identifyFlash.ts, just carrying a page number alongside the counter so player.js's
// /state poll can tell both "a new jump request arrived" and "which page it wants".
//
// Keyed by output (1 or 2) — same reasoning as identifyFlash.ts: a dual-output unit's
// two physical screens can show two entirely different PDFs (or none), so a jump
// request for output 2 must never also move output 1's page.

interface PdfJumpState {
  token: number;
  page: number;
}

const state: Record<1 | 2, PdfJumpState> = {
  1: { token: 0, page: 1 },
  2: { token: 0, page: 1 },
};

export function trigger(page: number, output: 1 | 2 = 1): void {
  state[output] = { token: state[output].token + 1, page };
}

export function getState(output: 1 | 2 = 1): PdfJumpState {
  return state[output];
}
