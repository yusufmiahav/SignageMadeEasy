// Backs the Settings screen's "Identify" button (bulb icon) — a technician staring
// at a wall of screens can trigger this to make one specific Pi's display blink,
// confirming which physical screen corresponds to which entry in the control app.
// Deliberately tiny: just a counter the player page's existing /state poll (see
// app.ts) picks up a change in, the same "token changed since last poll" pattern
// mediaCache/wifiManager-adjacent code in this project already uses elsewhere.

let token = 0;

export function trigger(): void {
  token += 1;
}

export function getToken(): number {
  return token;
}
