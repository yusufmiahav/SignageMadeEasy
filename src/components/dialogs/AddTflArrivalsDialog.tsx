import { useEffect, useState } from 'react';
import { DialogShell } from './DialogShell';
import type { AppState } from '../../hooks/useAppState';
import type { LibraryItem, TflStationConfig, TflStationLine, TflStationResult } from '../../api/types';

interface AddTflArrivalsDialogProps {
  app: AppState;
  onClose: () => void;
  /** When set, reconfigures this existing item's station list instead of adding a new one — the same repeatable "add a station" UI, just pre-populated. */
  editItem?: LibraryItem;
}

/** One station added to the board so far, with its own independently-editable line filter. `availableLines` empty means the full list couldn't be determined (only happens re-opening an existing board whose station name no longer resolves) — that station's lines show as a static list instead of checkboxes, but it can still be removed from the board. */
interface StationEntry {
  stopPointId: string;
  stopPointName: string;
  availableLines: TflStationLine[];
  selectedLines: Set<string>;
}

export function AddTflArrivalsDialog({ app, onClose, editItem }: AddTflArrivalsDialogProps) {
  const { addTflArrivals, setTflStations, searchTflStations } = app;
  const [name, setName] = useState(editItem?.name ?? '');
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [loadingExisting, setLoadingExisting] = useState(!!editItem);
  const [results, setResults] = useState<TflStationResult[] | null>(null);
  const [stations, setStations] = useState<StationEntry[]>([]);

  // Edit mode: re-look-up each already-configured station by name to recover its
  // full line list (the item itself only ever stored the *selected* subset — see
  // hub/src/tflArrivals.ts's header comment on why a station's complete line list
  // is never persisted). Runs once per station in parallel; one that fails to
  // resolve still shows up (removable), just without editable checkboxes.
  useEffect(() => {
    if (!editItem?.tflStations || editItem.tflStations.length === 0) return;
    let cancelled = false;
    setLoadingExisting(true);
    void Promise.all(editItem.tflStations.map(async (station): Promise<StationEntry> => {
      const found = await searchTflStations(station.stopPointName);
      const match = found.find((r) => r.id === station.stopPointId);
      if (match) {
        return {
          stopPointId: match.id, stopPointName: match.name, availableLines: match.lines,
          selectedLines: new Set(station.lines && station.lines.length > 0 ? station.lines : match.lines.map((l) => l.id)),
        };
      }
      return {
        stopPointId: station.stopPointId, stopPointName: station.stopPointName, availableLines: [],
        selectedLines: new Set(station.lines ?? []),
      };
    })).then((entries) => {
      if (!cancelled) setStations(entries);
    }).finally(() => {
      if (!cancelled) setLoadingExisting(false);
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editItem]);

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

  const addStation = (r: TflStationResult) => {
    if (stations.some((s) => s.stopPointId === r.id)) return; // already added
    setStations((prev) => [...prev, { stopPointId: r.id, stopPointName: r.name, availableLines: r.lines, selectedLines: new Set(r.lines.map((l) => l.id)) }]);
    setResults(null);
    setQuery('');
  };

  const removeStation = (stopPointId: string) => {
    setStations((prev) => prev.filter((s) => s.stopPointId !== stopPointId));
  };

  const toggleLine = (stopPointId: string, lineId: string) => {
    setStations((prev) => prev.map((s) => {
      if (s.stopPointId !== stopPointId) return s;
      const next = new Set(s.selectedLines);
      if (next.has(lineId)) next.delete(lineId);
      else next.add(lineId);
      return { ...s, selectedLines: next };
    }));
  };

  const canSave = stations.length > 0 && stations.every((s) => s.selectedLines.size > 0);

  const confirm = async () => {
    if (!canSave) return;
    const tflStations: TflStationConfig[] = stations.map((s) => ({
      stopPointId: s.stopPointId, stopPointName: s.stopPointName, lines: [...s.selectedLines],
    }));
    if (editItem) await setTflStations(editItem.id, tflStations);
    else await addTflArrivals(name, tflStations);
    onClose();
  };

  return (
    <DialogShell title={editItem ? 'Edit TfL station arrivals' : 'Add TfL station arrivals'} onClose={onClose}>
      <p className="dialog-body" style={{ margin: 0 }}>
        Shows live train countdowns for one or more stations — e.g. "District ·
        Westbound · 3 min, then 5, 8" — full-screen. Add a station below; add more
        than one to show them together on the same board, side by side in
        landscape or stacked in portrait. The hub polls Transport for London
        directly, nothing to configure on the screen itself.
      </p>
      {!editItem && (
        <div className="field">
          <label htmlFor="tfl-arrivals-name">Label (optional)</label>
          <input className="input" id="tfl-arrivals-name" placeholder="e.g. Westminster" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
      )}

      {loadingExisting ? (
        <p className="dialog-body text-muted" style={{ margin: 0 }}>Looking up this board's stations…</p>
      ) : (
        <>
          {stations.map((s) => (
            <div className="field" key={s.stopPointId} style={{ border: '1px solid var(--color-divider)', borderRadius: 8, padding: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 6 }}>
                <strong style={{ fontSize: 13 }}>{s.stopPointName}</strong>
                <button type="button" className="btn btn-ghost btn-icon" aria-label={`Remove ${s.stopPointName}`} onClick={() => removeStation(s.stopPointId)}>
                  ×
                </button>
              </div>
              {s.availableLines.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  {s.availableLines.map((l) => (
                    <label key={l.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '4px 0', cursor: 'pointer' }}>
                      <input type="checkbox" checked={s.selectedLines.has(l.id)} onChange={() => toggleLine(s.stopPointId, l.id)} />
                      <span style={{ flex: 1, fontSize: 13 }}>{l.name}</span>
                    </label>
                  ))}
                </div>
              ) : (
                <p className="dialog-body text-muted" style={{ margin: 0, fontSize: 12 }}>
                  Couldn't refresh this station's available lines — showing what's currently
                  configured ({[...s.selectedLines].join(', ') || 'none'}). Remove and re-add it to change lines.
                </p>
              )}
            </div>
          ))}

          <div className="field">
            <label htmlFor="tfl-arrivals-search">{stations.length > 0 ? 'Add another station' : 'Search for a station'}</label>
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
                    value=""
                    onChange={(e) => {
                      const picked = results.find((r) => r.id === e.target.value);
                      if (picked) addStation(picked);
                    }}
                  >
                    <option value="" disabled>Choose a station to add…</option>
                    {results.map((r) => (
                      <option key={r.id} value={r.id} disabled={stations.some((s) => s.stopPointId === r.id)}>
                        {r.name}{stations.some((s) => s.stopPointId === r.id) ? ' (already added)' : ''}
                      </option>
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
        </>
      )}

      <div className="dialog-actions">
        <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
        <button type="button" className="btn btn-primary" disabled={!canSave} onClick={() => void confirm()}>{editItem ? 'Save' : 'Add'}</button>
      </div>
    </DialogShell>
  );
}
