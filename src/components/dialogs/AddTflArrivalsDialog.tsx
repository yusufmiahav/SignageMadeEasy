import { useState } from 'react';
import { DialogShell } from './DialogShell';
import type { AppState } from '../../hooks/useAppState';
import type { TflStationResult } from '../../api/types';

interface AddTflArrivalsDialogProps {
  app: AppState;
  onClose: () => void;
}

export function AddTflArrivalsDialog({ app, onClose }: AddTflArrivalsDialogProps) {
  const { addTflArrivals, searchTflStations } = app;
  const [name, setName] = useState('');
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<TflStationResult[] | null>(null);
  const [station, setStation] = useState<TflStationResult | null>(null);
  const [lines, setLines] = useState<Set<string>>(new Set());

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
    await addTflArrivals(name, station.id, station.name, [...lines]);
    onClose();
  };

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
