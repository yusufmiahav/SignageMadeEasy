import { useEffect, useState } from 'react';
import { DialogShell } from './DialogShell';
import type { AppState } from '../../hooks/useAppState';
import type { LibraryItem, TflStationResult } from '../../api/types';

interface AddTflArrivalsDialogProps {
  app: AppState;
  onClose: () => void;
  /** When set, reconfigures this existing item's line filter instead of adding a new one — the station itself isn't editable here (only "which lines"), since changing station is really a different item. */
  editItem?: LibraryItem;
}

export function AddTflArrivalsDialog({ app, onClose, editItem }: AddTflArrivalsDialogProps) {
  const { addTflArrivals, setTflArrivalLines, searchTflStations } = app;
  const [name, setName] = useState(editItem?.name ?? '');
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<TflStationResult[] | null>(null);
  const [station, setStation] = useState<TflStationResult | null>(null);
  const [lines, setLines] = useState<Set<string>>(new Set());
  // Edit mode only — the item itself only ever stored the *selected* line ids, not
  // the full set of lines this station actually has (see hub/src/tflArrivals.ts's
  // header comment on why a station's complete line list is never persisted on the
  // item), so re-showing every option requires re-searching for it by name here.
  const [lookupFailed, setLookupFailed] = useState(false);

  const search = async () => {
    if (!query.trim()) return;
    setSearching(true);
    setResults(null);
    try {
      setResults(await searchTflStations(query.trim()));
    } finally {
      setSearching(false);
    }
  };

  const pickStation = (s: TflStationResult) => {
    setStation(s);
    setLines(new Set(s.lines.map((l) => l.id))); // every line at this station selected by default
  };

  useEffect(() => {
    if (!editItem || editItem.type !== 'tfl-arrivals' || !editItem.tflStopPointName) return;
    let cancelled = false;
    setSearching(true);
    setLookupFailed(false);
    void searchTflStations(editItem.tflStopPointName).then((found) => {
      if (cancelled) return;
      const match = found.find((r) => r.id === editItem.tflStopPointId);
      if (match) {
        setStation(match);
        // Empty/undefined tflArrivalLines means "every line" at add-time — reflect
        // that same effective state here rather than showing nothing checked.
        setLines(new Set(editItem.tflArrivalLines && editItem.tflArrivalLines.length > 0 ? editItem.tflArrivalLines : match.lines.map((l) => l.id)));
      } else {
        setLookupFailed(true);
      }
    }).finally(() => {
      if (!cancelled) setSearching(false);
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editItem]);

  const toggleLine = (id: string) => {
    setLines((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const confirm = async () => {
    if (!station) return;
    if (editItem) await setTflArrivalLines(editItem.id, [...lines]);
    else await addTflArrivals(name, station.id, station.name, [...lines]);
    onClose();
  };

  if (editItem) {
    return (
      <DialogShell title="Edit TfL station arrivals" onClose={onClose}>
        <p className="dialog-body" style={{ margin: 0 }}>
          Change which lines show on this board — the station itself ({editItem.tflStopPointName}) can't be
          changed here; add a new TfL arrivals item instead if you need a different station.
        </p>
        {searching && <p className="dialog-body text-muted" style={{ margin: 0 }}>Looking up this station's lines…</p>}
        {!searching && lookupFailed && (
          <p className="dialog-body" style={{ margin: 0, color: 'var(--color-danger, #c0392b)' }}>
            Couldn't look up this station's available lines right now — the hub may be
            unable to reach TfL. Close this and try again shortly.
          </p>
        )}
        {!searching && station && station.lines.length > 0 && (
          <div className="field">
            <label>Show arrivals for</label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {station.lines.map((l) => (
                <label key={l.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0', borderBottom: '1px solid var(--color-divider)', cursor: 'pointer' }}>
                  <input type="checkbox" checked={lines.has(l.id)} onChange={() => toggleLine(l.id)} />
                  <span style={{ flex: 1, fontSize: 13 }}>{l.name}</span>
                </label>
              ))}
            </div>
          </div>
        )}
        <div className="dialog-actions">
          <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button type="button" className="btn btn-primary" disabled={!station || lines.size === 0} onClick={() => void confirm()}>Save</button>
        </div>
      </DialogShell>
    );
  }

  return (
    <DialogShell title="Add TfL station arrivals" onClose={onClose}>
      <p className="dialog-body" style={{ margin: 0 }}>
        Shows live train countdowns for one station — e.g. "District · Westbound ·
        3 min, then 5, 8" — full-screen. Search for the station below; the hub polls
        Transport for London directly, nothing to configure on the screen itself.
      </p>
      <div className="field">
        <label htmlFor="tfl-arrivals-name">Label (optional)</label>
        <input className="input" id="tfl-arrivals-name" placeholder="e.g. Westminster" value={name} onChange={(e) => setName(e.target.value)} />
      </div>

      <div className="field">
        <label htmlFor="tfl-arrivals-search">Search for a station</label>
        <div style={{ display: 'flex', gap: 6 }}>
          <input
            className="input"
            id="tfl-arrivals-search"
            placeholder="e.g. Westminster"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void search(); } }}
            style={{ flex: 1 }}
          />
          <button type="button" className="btn btn-secondary" onClick={() => void search()} disabled={searching || !query.trim()}>
            {searching ? 'Searching…' : 'Search'}
          </button>
        </div>
      </div>

      {results != null && (
        <div className="field">
          {results.length > 0 ? (
            <>
              <label htmlFor="tfl-arrivals-results">Station</label>
              <select
                className="input"
                id="tfl-arrivals-results"
                aria-label="Station"
                value={station?.id ?? ''}
                onChange={(e) => {
                  const picked = results.find((r) => r.id === e.target.value);
                  if (picked) pickStation(picked);
                }}
              >
                <option value="" disabled>Choose a station…</option>
                {results.map((r) => (
                  <option key={r.id} value={r.id}>{r.name}</option>
                ))}
              </select>
            </>
          ) : (
            <p className="dialog-body" style={{ margin: 0 }}>
              No stations found for "{query.trim()}" — check the spelling, or try a
              nearby station name instead.
            </p>
          )}
        </div>
      )}

      {station && station.lines.length > 0 && (
        <div className="field">
          <label>Show arrivals for</label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {station.lines.map((l) => (
              <label key={l.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0', borderBottom: '1px solid var(--color-divider)', cursor: 'pointer' }}>
                <input type="checkbox" checked={lines.has(l.id)} onChange={() => toggleLine(l.id)} />
                <span style={{ flex: 1, fontSize: 13 }}>{l.name}</span>
              </label>
            ))}
          </div>
        </div>
      )}

      <div className="dialog-actions">
        <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
        <button type="button" className="btn btn-primary" disabled={!station} onClick={() => void confirm()}>Add</button>
      </div>
    </DialogShell>
  );
}
