import { useState } from 'react';
import { DialogShell } from './DialogShell';
import { Icon } from '../icons/Icon';

interface BlackoutDialogProps {
  /** e.g. "this location" or "every screen" — used in the dialog copy only. */
  scopeLabel: string;
  current: boolean;
  onConfirm: (blackout: boolean) => Promise<void>;
  onClose: () => void;
}

export function BlackoutDialog({ scopeLabel, current, onConfirm, onClose }: BlackoutDialogProps) {
  const [choice, setChoice] = useState(current);

  const confirm = async () => {
    await onConfirm(choice);
    onClose();
  };

  return (
    <DialogShell title="Blackout" onClose={onClose}>
      <p className="dialog-body" style={{ margin: 0 }}>
        An emergency override: {scopeLabel} goes to a plain black screen — above even forced content — until you turn
        it off here.
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <label className="radio">
          <input type="radio" name="blackoutPick" checked={!choice} onChange={() => setChoice(false)} />
          <span className="dot" />
          Back to normal
        </label>
        <label className="radio">
          <input type="radio" name="blackoutPick" checked={choice} onChange={() => setChoice(true)} />
          <span className="dot" />
          Blackout — plain black screen
        </label>
      </div>
      {choice && (
        <div className="dialog-warning">
          <Icon name="alertTriangle" size={16} />
          <span>This immediately blanks {scopeLabel} — including any announcement ticker — with nothing else shown until you clear it.</span>
        </div>
      )}
      <div className="dialog-actions">
        <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
        <button type="button" className={choice ? 'btn btn-warning' : 'btn btn-primary'} onClick={() => void confirm()}>Apply</button>
      </div>
    </DialogShell>
  );
}
