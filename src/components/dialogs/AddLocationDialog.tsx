import { useState } from 'react';
import { DialogShell } from './DialogShell';
import type { AppState } from '../../hooks/useAppState';

interface AddLocationDialogProps {
  app: AppState;
  onClose: () => void;
}

export function AddLocationDialog({ app, onClose }: AddLocationDialogProps) {
  const { addGroup, showToast } = app;
  const [name, setName] = useState('');

  const confirm = async () => {
    if (!name.trim()) return;
    const group = await addGroup(name);
    showToast(`Added ${group.name}`);
    onClose();
  };

  return (
    <DialogShell title="Add a location" onClose={onClose}>
      <p className="dialog-body" style={{ margin: 0 }}>
        Creates an empty location with no screens yet — pair a screen to it later, or move an existing one here.
      </p>
      <div className="field">
        <label htmlFor="new-location-name">Location name</label>
        <input
          className="input"
          id="new-location-name"
          placeholder="e.g. Reception"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && void confirm()}
          autoFocus
        />
      </div>
      <div className="dialog-actions">
        <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
        <button type="button" className="btn btn-primary" disabled={!name.trim()} onClick={() => void confirm()}>Add location</button>
      </div>
    </DialogShell>
  );
}
