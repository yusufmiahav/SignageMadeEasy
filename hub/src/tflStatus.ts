// Backs the 'tfl-status' library item type (see types.ts) — polls TfL's public
// Unified API centrally, once, on an interval, so every screen showing a status
// board just reads from this in-memory cache via its normal ~5s /api/player/:id/state
// poll instead of every screen hitting TfL directly. Verified against the real,
// live API (unauthenticated) before writing this: response shape is a flat array of
// lines, each `{ id, name, modeName, lineStatuses: [{ statusSeverityDescription, ... }] }`.
// Deliberately not hardcoding a line list anywhere here — TfL has renamed lines
// before (the 2024 Overground split into Lioness/Mildmay/etc.), so this always
// renders whatever the API currently reports for the requested modes.

export interface TflLine {
  id: string;
  name: string;
  modeName: string;
  statusSeverityDescription: string;
  /**
   * TfL's own free-text explanation of a disruption (e.g. "District line: Part
   * suspended between Turnham Green and Richmond..."), from the standard
   * LineStatus.reason field — present when there's an actual disruption to explain,
   * absent/empty for "Good Service". Not verified against a live disrupted line
   * (nothing was disrupted when this was built — see the live "Good Service"
   * sample this was written against), so player.js treats this as optional and
   * degrades to just the status text if it's ever missing.
   */
  reason?: string;
}

// Every mode this feature supports (see AddTflStatusDialog.tsx's checkboxes) is
// always polled together in one request, regardless of which modes any particular
// library item actually uses — one small, infrequent call is simpler than tracking
// "which modes are currently in use" and re-polling when that set changes.
const ALL_MODES = ['tube', 'overground', 'dlr', 'elizabeth-line'];
const POLL_INTERVAL_MS = 2 * 60 * 1000; // line status doesn't change second-to-second — this is plenty "live" for a wall display

interface RawLineStatus {
  statusSeverityDescription?: string;
  reason?: string;
}
interface RawLine {
  id: string;
  name: string;
  modeName: string;
  lineStatuses?: RawLineStatus[];
}

let cache: TflLine[] = [];
let lastError: string | null = null;

async function pollOnce(): Promise<void> {
  try {
    const url = new URL(`https://api.tfl.gov.uk/Line/Mode/${ALL_MODES.join(',')}/Status`);
    // Optional — TfL serves this unauthenticated at a lower rate limit, plenty for
    // one poll every 2 minutes; set TFL_APP_KEY for higher limits (register free at
    // api-portal.tfl.gov.uk). See hub/README.md.
    if (process.env.TFL_APP_KEY) url.searchParams.set('app_key', process.env.TFL_APP_KEY);
    const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) throw new Error(`TfL API returned ${res.status}`);
    const lines = (await res.json()) as RawLine[];
    cache = lines.map((l) => ({
      id: l.id,
      name: l.name,
      modeName: l.modeName,
      statusSeverityDescription: l.lineStatuses?.[0]?.statusSeverityDescription ?? 'Unknown',
      ...(l.lineStatuses?.[0]?.reason && { reason: l.lineStatuses[0].reason }),
    }));
    lastError = null;
  } catch (err) {
    // Keeps serving the last-known-good cache through a transient TfL/network
    // blip — logged once per failed poll rather than thrown, since a screen with a
    // stale-but-real status board is better than one that goes blank over this.
    lastError = err instanceof Error ? err.message : String(err);
    console.error('[tflStatus] poll failed:', lastError);
  }
}

let started = false;
export function startPolling(): void {
  if (started) return;
  started = true;
  void pollOnce();
  setInterval(() => void pollOnce(), POLL_INTERVAL_MS);
}

export function getLinesForModes(modes: string[]): TflLine[] {
  const wanted = new Set(modes);
  return cache.filter((l) => wanted.has(l.modeName));
}
