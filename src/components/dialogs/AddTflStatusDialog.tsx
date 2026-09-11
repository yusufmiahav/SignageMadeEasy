import { useState } from 'react';
import { DialogShell } from './DialogShell';
import type { AppState } from '../../hooks/useAppState';

interface AddTflStatusDialogProps {
  app: AppState;
  onClose: () => void;
}

// Kept in sync by hand with hub/src/routes/library.ts's VALID_TFL_MODES.
const MODES: { id: string; label: string }[] = [
  { id: 'tube', label: 'London Underground' },
  { id: 'overground', label: 'London Overground' },
  { id: 'dlr', label: 'DLR' },
  { id: 'elizabeth-line', label: 'Elizabeth line' },
];

export function AddTflStatusDialog({ app, onClose }: AddTflStatusDialogProps) {
  const { addTflStatus } = app;
  const [name, setName] = useState('');
  const [modes, setModes] = useState<Set<string>>(new Set(['tube']));

  const toggle = (id: string) => {
    setModes((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const confirm = async () => {
    if (modes.size === 0) return;
    await addTflStatus(name, [...modes]);
    onClose();
  };

  return (
    <DialogShell title="Add a TfL status board" onClose={onClose}>
      <p className="dialog-body" style={{ margin: 0 }}>
        Shows live line status (Good service, Minor delays, etc.) for the modes you
        pick below, full-screen. The hub polls Transport for London directly — nothing
        to configure on the screen itself.
      </p>
      <div className="field">
        <label htmlFor="tfl-name">Label (optional)</label>
        <input className="input" id="tfl-name" placeholder="e.g. Tube status" value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div className="field">
        <label>Show status for</label>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {MODES.map((m) => (
            <label key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0', borderBottom: '1px solid var(--color-divider)', cursor: 'pointer' }}>
              <input type="checkbox" checked={modes.has(m.id)} onChange={() => toggle(m.id)} />
              <span style={{ flex: 1, fontSize: 13 }}>{m.label}</span>
            </label>
          ))}
        </div>
      </div>
      <div className="dialog-actions">
        <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
        <button type="button" className="btn btn-primary" disabled={modes.size === 0} onClick={() => void confirm()}>Add</button>
      </div>
    </DialogShell>
  );
}
