import { useState } from 'react';
import { DialogShell } from './DialogShell';
import type { AppState } from '../../hooks/useAppState';
import type { Device } from '../../api/types';

interface MoveDeviceDialogProps {
  app: AppState;
  device: Device;
  onClose: () => void;
}

export function MoveDeviceDialog({ app, device, onClose }: MoveDeviceDialogProps) {
  const { groups, addGroup, moveDevice } = app;
  const [choiceId, setChoiceId] = useState<string>(device.groupId);
  const [newGroupName, setNewGroupName] = useState('');

  const isNewGroup = choiceId === '__new__';

  const confirm = async () => {
    let targetId = choiceId;
    if (isNewGroup) {
      if (!newGroupName.trim()) return;
      const group = await addGroup(newGroupName);
      targetId = group.id;
    }
    await moveDevice(device.id, targetId);
    onClose();
  };

  return (
    <DialogShell title="Move to a different location" onClose={onClose}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {groups.map((g) => (
          <label key={g.id} className="radio">
            <input type="radio" name="moveDevicePick" checked={choiceId === g.id} onChange={() => setChoiceId(g.id)} />
            <span className="dot" />
            {g.name}
          </label>
        ))}
        <label className="radio">
          <input type="radio" name="moveDevicePick" checked={isNewGroup} onChange={() => setChoiceId('__new__')} />
          <span className="dot" />
          + New location
        </label>
      </div>
      {isNewGroup && (
        <div className="field">
          <label htmlFor="move-new-loc-name">New location name</label>
          <input
            className="input"
            id="move-new-loc-name"
            placeholder="e.g. Reception"
            value={newGroupName}
            onChange={(e) => setNewGroupName(e.target.value)}
            autoFocus
          />
        </div>
      )}
      <div className="dialog-actions">
        <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
        <button type="button" className="btn btn-primary" disabled={isNewGroup && !newGroupName.trim()} onClick={() => void confirm()}>Move</button>
      </div>
    </DialogShell>
  );
}
