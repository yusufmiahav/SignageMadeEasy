import { useState } from 'react';
import { DialogShell } from './DialogShell';
import type { AppState } from '../../hooks/useAppState';

interface ForceContentDialogProps {
  app: AppState;
  /** e.g. "this location" or "every screen" — used in the dialog copy only. */
  scopeLabel: string;
  currentId: string | null;
  onConfirm: (libId: string | null) => Promise<void>;
  onClose: () => void;
}

export function ForceContentDialog({ app, scopeLabel, currentId, onConfirm, onClose }: ForceContentDialogProps) {
  const { library } = app;
  const [choiceId, setChoiceId] = useState<string | null>(currentId);

  const confirm = async () => {
    await onConfirm(choiceId);
    onClose();
  };

  return (
    <DialogShell title="Force content" onClose={onClose}>
      <p className="dialog-body" style={{ margin: 0 }}>
        Stops the rolling schedule on {scopeLabel} and shows one piece of content until you turn it off.
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2, maxHeight: 260, overflowY: 'auto' }}>
        <label className="radio">
          <input type="radio" name="forceContentPick" checked={choiceId == null} onChange={() => setChoiceId(null)} />
          <span className="dot" />
          Back to rolling schedule
        </label>
        {library.filter((item) => item.type !== 'announcement').map((item) => (
          <label key={item.id} className="radio">
            <input type="radio" name="forceContentPick" checked={choiceId === item.id} onChange={() => setChoiceId(item.id)} />
            <span className="dot" />
            {item.name}
          </label>
        ))}
      </div>
      <div className="dialog-actions">
        <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
        <button type="button" className="btn btn-primary" onClick={() => void confirm()}>Apply</button>
      </div>
    </DialogShell>
  );
}
