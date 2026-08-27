import { useState } from 'react';
import { DialogShell } from './DialogShell';
import type { AppState } from '../../hooks/useAppState';

interface ForceAnnouncementDialogProps {
  app: AppState;
  /** e.g. "this location" or "every screen" — used in the dialog copy only. */
  scopeLabel: string;
  currentId: string | null;
  onConfirm: (announcementId: string | null) => Promise<void>;
  onClose: () => void;
}

export function ForceAnnouncementDialog({ app, scopeLabel, currentId, onConfirm, onClose }: ForceAnnouncementDialogProps) {
  const { library } = app;
  const announcements = library.filter((l) => l.type === 'announcement');
  const [choiceId, setChoiceId] = useState<string | null>(currentId);

  const confirm = async () => {
    await onConfirm(choiceId);
    onClose();
  };

  return (
    <DialogShell title="Force announcement" onClose={onClose}>
      <p className="dialog-body" style={{ margin: 0 }}>
        Runs as a ticker across the bottom of {scopeLabel}, overriding each screen's own announcement setting, until
        you turn it off here.
      </p>
      {announcements.length === 0 ? (
        <p className="dialog-body">Add an announcement from the Library first.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <label className="radio">
            <input type="radio" name="forceAnnPick" checked={choiceId == null} onChange={() => setChoiceId(null)} />
            <span className="dot" />
            Off
          </label>
          {announcements.map((a) => (
            <label key={a.id} className="radio">
              <input type="radio" name="forceAnnPick" checked={choiceId === a.id} onChange={() => setChoiceId(a.id)} />
              <span className="dot" />
              {a.name}
            </label>
          ))}
        </div>
      )}
      <div className="dialog-actions">
        <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
        <button type="button" className="btn btn-primary" onClick={() => void confirm()}>Apply</button>
      </div>
    </DialogShell>
  );
}
