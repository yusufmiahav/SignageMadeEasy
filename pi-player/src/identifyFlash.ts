// Backs the Settings screen's "Identify" button (bulb icon) — a technician staring
// at a wall of screens can trigger this to make one specific Pi's display blink,
// confirming which physical screen corresponds to which entry in the control app.
// Deliberately tiny: just a counter the player page's existing /state poll (see
// app.ts) picks up a change in, the same "token changed since last poll" pattern
// mediaCache/wifiManager-adjacent code in this project already uses elsewhere.
//
// Keyed by output (1 or 2) so a dual-output unit's two control-app rows can each
// blink just their own physical port — triggering output 2's Identify must never
// also blink output 1's screen, or the whole point (telling two ports on one box
// apart) is defeated.

const tokens: Record<1 | 2, number> = { 1: 0, 2: 0 };

export function trigger(output: 1 | 2 = 1): void {
  tokens[output] += 1;
}

export function getToken(output: 1 | 2 = 1): number {
  return tokens[output];
}
