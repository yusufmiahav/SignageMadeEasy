// Backs the 'tfl-arrivals' library item type — a live per-station countdown board
// (e.g. "District · Westbound · 3 min · Platform 1"), distinct from tflStatus.ts's
// line-status board. Verified against the real, live TfL API before writing this
// (fetched by hand, since this sandbox can't reach api.tfl.gov.uk):
//
// 1. Searching a station name (e.g. "Westminster") via /StopPoint/Search/<query>
//    often returns a "hub" StopPoint (id like "HUBWSM") representing the whole
//    interchange, not something Arrivals actually works with directly — confirmed
//    live: GET /StopPoint/HUBWSM/Arrivals returns []. The real, queryable
//    per-mode station lives under that hub's own `children` array (e.g.
//    "940GZZLUWSM" — Westminster Underground Station specifically, distinct from
//    "Westminster Pier" or the bus stops also under the same hub).
// 2. GET /StopPoint/<realStopId>/Arrivals returns a flat array of predictions,
//    confirmed live to include (among other fields): lineId, lineName,
//    platformName, direction, towards, timeToStation (seconds).
//
// searchStations() below does the hub->children resolution server-side so the
// control app's search UI never has to know this distinction exists — it always
// gets back directly-usable station ids.

const RAIL_MODES = ['tube', 'dlr', 'overground', 'elizabeth-line', 'tram'];
const POLL_INTERVAL_MS = 30_000; // arrivals are minutes away, not hours — tflStatus.ts's 2-minute cadence would show visibly stale countdowns
const SEARCH_RESULT_CAP = 8; // bounds the hub->children detail-lookup fanout below to a handful of API calls per search, not one per every match TfL returns

function tflFetch(path: string, params?: Record<string, string>): Promise<Response> {
  const url = new URL(`https://api.tfl.gov.uk${path}`);
  for (const [k, v] of Object.entries(params ?? {})) url.searchParams.set(k, v);
  if (process.env.TFL_APP_KEY) url.searchParams.set('app_key', process.env.TFL_APP_KEY);
  return fetch(url, { signal: AbortSignal.timeout(8_000) });
}

export interface StationLine {
  id: string;
  name: string;
}

export interface StationResult {
  id: string;
  name: string;
  modes: string[];
  /** Rail lines serving this specific station (not the whole area) — populates AddTflArrivalsDialog's line-filter checkboxes with no further round-trip needed. */
  lines: StationLine[];
}

interface RawSearchMatch {
  id: string;
  name: string;
  modes?: string[];
}
interface RawLineIdentifier {
  id: string;
  name: string;
}
interface RawStopPointDetail {
  children?: { naptanId: string; commonName: string; modes?: string[] }[];
  lines?: RawLineIdentifier[];
}

// TfL's StopPoint.lines mixes bus routes in with rail lines with no mode field of
// its own to filter on — but every rail line id seen across this project (tube,
// DLR, Overground, Elizabeth line, Tram) is a plain lowercase word/hyphenated
// slug ("jubilee", "district", "elizabeth", "waterloo-city"), while every bus
// route id/number confirmed live always contains a digit ("12", "159", "n109").
// Simpler and more robust than hardcoding a line list that TfL has changed
// before (see tflStatus.ts).
function isRailLineId(id: string): boolean {
  return /^[a-z-]+$/.test(id);
}

async function stationDetail(stopId: string): Promise<RawStopPointDetail | null> {
  try {
    const res = await tflFetch(`/StopPoint/${stopId}`);
    if (!res.ok) return null;
    return (await res.json()) as RawStopPointDetail;
  } catch {
    return null;
  }
}

export async function searchStations(query: string): Promise<StationResult[]> {
  const res = await tflFetch(`/StopPoint/Search/${encodeURIComponent(query)}`, { modes: RAIL_MODES.join(',') });
  if (!res.ok) throw new Error(`TfL station search returned ${res.status}`);
  const data = (await res.json()) as { matches?: RawSearchMatch[] };
  const matches = (data.matches ?? []).slice(0, SEARCH_RESULT_CAP);

  const resolved = await Promise.all(matches.map(async (m): Promise<StationResult[]> => {
    const detail = await stationDetail(m.id);
    const children = (detail?.children ?? []).filter((c) => (c.modes ?? []).some((mode) => RAIL_MODES.includes(mode)));
    if (children.length === 0) {
      // Not a hub/interchange (or the detail lookup failed) — already a leaf
      // station, use it as-is. Its own `lines` (if the detail lookup succeeded)
      // populate the filter checkboxes; otherwise falls back to an empty list,
      // meaning "show every line reported at playback time" (see getBoardForStop).
      const lines = (detail?.lines ?? []).filter((l) => isRailLineId(l.id));
      return [{ id: m.id, name: m.name, modes: m.modes ?? [], lines }];
    }
    // A hub — expand into its actual queryable rail-mode children (each fetched
    // again individually, since a hub's own `lines` is the union across every
    // child, not what serves this specific one).
    const childResults = await Promise.all(children.map(async (c): Promise<StationResult> => {
      const childDetail = await stationDetail(c.naptanId);
      const lines = (childDetail?.lines ?? []).filter((l) => isRailLineId(l.id));
      return { id: c.naptanId, name: c.commonName, modes: c.modes ?? [], lines };
    }));
    return childResults;
  }));

  return resolved.flat();
}

interface RawPrediction {
  lineId?: string;
  lineName?: string;
  platformName?: string;
  direction?: string;
  towards?: string;
  timeToStation?: number;
}

interface ArrivalPrediction {
  lineId: string;
  lineName: string;
  platformName: string;
  direction: string;
  towards: string;
  timeToStation: number;
}

export interface PlatformBoard {
  lineId: string;
  lineName: string;
  platformName: string;
  towards: string;
  /** Seconds until each of the next few trains at this platform/direction, soonest first — see getBoardForStop's grouping. */
  arrivalsSec: number[];
}

const cache = new Map<string, ArrivalPrediction[]>();
let getNeededStopIds: (() => string[]) | null = null;
let started = false;

async function pollStop(stopPointId: string): Promise<void> {
  try {
    const res = await tflFetch(`/StopPoint/${stopPointId}/Arrivals`);
    if (!res.ok) throw new Error(`TfL arrivals returned ${res.status}`);
    const raw = (await res.json()) as RawPrediction[];
    cache.set(stopPointId, raw.map((p) => ({
      lineId: p.lineId ?? p.lineName?.toLowerCase() ?? '',
      lineName: p.lineName ?? 'Unknown',
      platformName: p.platformName ?? '',
      direction: p.direction ?? '',
      towards: p.towards ?? '',
      timeToStation: p.timeToStation ?? 0,
    })));
  } catch (err) {
    // Keeps serving whatever was cached before, same "stale beats blank" reasoning
    // as tflStatus.ts — logged once per failed poll, not thrown.
    console.error(`[tflArrivals] poll failed for ${stopPointId}:`, err instanceof Error ? err.message : err);
  }
}

async function pollAll(): Promise<void> {
  const neededIds = new Set(getNeededStopIds ? getNeededStopIds() : []);
  // Prune stations no library item references anymore, rather than polling (and
  // holding stale data for) a station nothing on any screen still shows.
  for (const id of cache.keys()) if (!neededIds.has(id)) cache.delete(id);
  await Promise.all([...neededIds].map((id) => pollStop(id)));
}

/**
 * `getNeeded` is a callback rather than this module importing store.ts directly,
 * to avoid a circular import — store.ts already needs to import this module (to
 * resolve a 'tfl-arrivals' item's board at playback time), so this can't also
 * import store.ts back. Called from index.ts, which has both.
 */
export function startPolling(getNeeded: () => string[]): void {
  if (started) return;
  started = true;
  getNeededStopIds = getNeeded;
  void pollAll();
  setInterval(() => void pollAll(), POLL_INTERVAL_MS);
}

/**
 * Groups raw predictions by platform+direction (matching how a real departure
 * board reads — one row per platform, not one row per individual train) and
 * keeps the next 3 arrivals for each, soonest-platform-first. `lineFilter`
 * (line ids, e.g. ['jubilee', 'district']) restricts to just those lines when
 * non-empty; empty/undefined shows every line reported at this station.
 */
export function getBoardForStop(stopPointId: string, lineFilter?: string[]): PlatformBoard[] {
  const all = cache.get(stopPointId) ?? [];
  const filtered = lineFilter && lineFilter.length > 0 ? all.filter((p) => lineFilter.includes(p.lineId)) : all;

  const byPlatform = new Map<string, ArrivalPrediction[]>();
  for (const p of filtered) {
    const key = `${p.lineId}|${p.platformName}|${p.towards}`;
    const group = byPlatform.get(key);
    if (group) group.push(p);
    else byPlatform.set(key, [p]);
  }

  const boards: PlatformBoard[] = [...byPlatform.values()].map((preds) => {
    const sorted = [...preds].sort((a, b) => a.timeToStation - b.timeToStation);
    const first = sorted[0];
    return {
      lineId: first.lineId,
      lineName: first.lineName,
      platformName: first.platformName,
      towards: first.towards,
      arrivalsSec: sorted.slice(0, 3).map((p) => p.timeToStation),
    };
  });
  boards.sort((a, b) => a.arrivalsSec[0] - b.arrivalsSec[0]);
  return boards;
}
