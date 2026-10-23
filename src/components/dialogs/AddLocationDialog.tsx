import { useState } from 'react';
import { DialogShell } from './DialogShell';
import type { AppState } from '../../hooks/useAppState';

interface AddLocationDialogProps {
  app: AppState;
  onClose: () => void;
}

// Purely organizational — see api/types.ts's Location. Creates an empty area you can
// then file groups and/or standalone screens under, for browsing/managing a whole
// site at once; it has no content/schedule of its own.
export function AddLocationDialog({ app, onClose }: AddLocationDialogProps) {
  const { addLocation, showToast } = app;
  const [name, setName] = useState('');

  const confirm = async () => {
    if (!name.trim()) return;
    const location = await addLocation(name);
    showToast(`Added ${location.name}`);
    onClose();
  };

  return (
    <DialogShell title="Add a location" onClose={onClose}>
      <p className="dialog-body" style={{ margin: 0 }}>
        An area for organizing screens — e.g. "Warehouse Building" or "Reception". A
        location has no content of its own: file a group (screens showing the same
        content) and/or standalone screens under it later, or move existing ones here.
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
