import { useState } from 'react';
import { DialogShell } from './DialogShell';
import type { AppState } from '../../hooks/useAppState';

const TYPE_LABEL: Record<string, string> = { image: 'Image', video: 'Video', pdf: 'PDF', announcement: 'Announcement' };

function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

interface AddEventDialogProps {
  app: AppState;
  groupId: string;
  onClose: () => void;
}

export function AddEventDialog({ app, groupId, onClose }: AddEventDialogProps) {
  const { library, addEvent } = app;
  const [name, setName] = useState('');
  const [start, setStart] = useState(todayISO());
  const [end, setEnd] = useState(todayISO());
  const [checked, setChecked] = useState<Set<string>>(new Set());

  const toggle = (id: string) => {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const confirm = async () => {
    if (!name.trim() || !start || !end) return;
    await addEvent(groupId, { name: name.trim(), start, end, libIds: Array.from(checked) });
    onClose();
  };

  return (
    <DialogShell title="Add an event" onClose={onClose}>
      <div className="field">
        <label htmlFor="ev-name">Event name</label>
        <input className="input" id="ev-name" placeholder="e.g. Back to School Promo" value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <div className="field">
          <label htmlFor="ev-start">Starts</label>
          <input className="input" id="ev-start" type="date" value={start} onChange={(e) => setStart(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="ev-end">Ends</label>
          <input className="input" id="ev-end" type="date" value={end} onChange={(e) => setEnd(e.target.value)} />
        </div>
      </div>
      <div className="field">
        <label>Replaces the default playlist with</label>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, maxHeight: 200, overflowY: 'auto' }}>
          {library.filter((item) => item.type !== 'announcement').map((item) => (
            <label key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0', borderBottom: '1px solid var(--color-divider)', cursor: 'pointer' }}>
              <input type="checkbox" checked={checked.has(item.id)} onChange={() => toggle(item.id)} />
              <span style={{ flex: 1, fontSize: 13 }}>{item.name}</span>
              <span className="tag tag-neutral">{TYPE_LABEL[item.type]}</span>
            </label>
          ))}
        </div>
      </div>
      <div className="dialog-actions">
        <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
        <button type="button" className="btn btn-primary" onClick={() => void confirm()}>Add event</button>
      </div>
    </DialogShell>
  );
}
