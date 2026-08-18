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
  const { groups, moveDevice } = app;
  const [choiceId, setChoiceId] = useState(device.groupId);

  const confirm = async () => {
    if (!choiceId) return;
    await moveDevice(device.id, choiceId);
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
      </div>
      <div className="dialog-actions">
        <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
        <button type="button" className="btn btn-primary" onClick={() => void confirm()}>Move</button>
      </div>
    </DialogShell>
  );
}
