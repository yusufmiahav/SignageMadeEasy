import { useState } from 'react';
import { DialogShell } from './DialogShell';

interface NewFolderDialogProps {
  onConfirm: (name: string) => void;
  onClose: () => void;
}

export function NewFolderDialog({ onConfirm, onClose }: NewFolderDialogProps) {
  const [name, setName] = useState('');

  const confirm = () => {
    if (!name.trim()) return;
    onConfirm(name.trim());
    onClose();
  };

  return (
    <DialogShell title="New folder" onClose={onClose}>
      <div className="field">
        <label htmlFor="new-folder-name">Folder name</label>
        <input
          className="input"
          id="new-folder-name"
          placeholder="e.g. Seasonal"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); confirm(); } }}
          autoFocus
        />
      </div>
      <div className="dialog-actions">
        <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
        <button type="button" className="btn btn-primary" disabled={!name.trim()} onClick={confirm}>Create</button>
      </div>
    </DialogShell>
  );
}
