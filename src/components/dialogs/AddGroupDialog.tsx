import { useState } from 'react';
import { DialogShell } from './DialogShell';
import type { AppState } from '../../hooks/useAppState';

interface AddGroupDialogProps {
  app: AppState;
  onClose: () => void;
  /** Pre-files the new group under this Location — set when "Add group" is clicked from within a specific location's section on Home; omitted (no location) when added from the top-level "+" chooser. */
  locationId?: string | null;
}

// Every screen paired into this group shows the exact same content — see
// api/types.ts's Group. Distinct from AddLocationDialog, which creates a purely
// organizational area with no shared content at all.
export function AddGroupDialog({ app, onClose, locationId }: AddGroupDialogProps) {
  const { addGroup, showToast } = app;
  const [name, setName] = useState('');

  const confirm = async () => {
    if (!name.trim()) return;
    const group = await addGroup(name, locationId ?? null);
    showToast(`Added ${group.name}`);
    onClose();
  };

  return (
    <DialogShell title="Add a group" onClose={onClose}>
      <p className="dialog-body" style={{ margin: 0 }}>
        Creates an empty group with no screens yet — every screen paired into it
        shows the same rolling schedule. Pair a screen to it later, or move an
        existing one here.
      </p>
      <div className="field">
        <label htmlFor="new-group-name">Group name</label>
        <input
          className="input"
          id="new-group-name"
          placeholder="e.g. Lobby screens"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && void confirm()}
          autoFocus
        />
      </div>
      <div className="dialog-actions">
        <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
        <button type="button" className="btn btn-primary" disabled={!name.trim()} onClick={() => void confirm()}>Add group</button>
      </div>
    </DialogShell>
  );
}
