import { useState } from 'react';
import { DialogShell } from './DialogShell';
import type { AppState } from '../../hooks/useAppState';
import type { Device } from '../../api/types';

interface MoveDeviceDialogProps {
  app: AppState;
  device: Device;
  onClose: () => void;
}

const NO_GROUP = '__none__';

export function MoveDeviceDialog({ app, device, onClose }: MoveDeviceDialogProps) {
  const { groups, locations, addGroup, moveDevice, setDeviceLocation } = app;
  const [choiceId, setChoiceId] = useState<string>(device.groupId ?? NO_GROUP);
  const [newGroupName, setNewGroupName] = useState('');
  // Only meaningful once this screen ends up standalone (no group) — see
  // Device.locationId's comment.
  const [locationId, setLocationId] = useState<string>(device.locationId ?? '');

  const isNewGroup = choiceId === '__new__';

  const confirm = async () => {
    let targetId: string | null = choiceId;
    if (isNewGroup) {
      if (!newGroupName.trim()) return;
      const group = await addGroup(newGroupName);
      targetId = group.id;
    } else if (choiceId === NO_GROUP) {
      targetId = null;
    }
    await moveDevice(device.id, targetId);
    if (targetId === null) await setDeviceLocation(device.id, locationId || null);
    onClose();
  };

  return (
    <DialogShell title="Move to a different group" onClose={onClose}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <label className="radio">
          <input type="radio" name="moveDevicePick" checked={choiceId === NO_GROUP} onChange={() => setChoiceId(NO_GROUP)} />
          <span className="dot" />
          No group (standalone screen)
        </label>
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
          + New group
        </label>
      </div>
      {isNewGroup && (
        <div className="field">
          <label htmlFor="move-new-loc-name">New group name</label>
          <input
            className="input"
            id="move-new-loc-name"
            placeholder="e.g. Lobby screens"
            value={newGroupName}
            onChange={(e) => setNewGroupName(e.target.value)}
            autoFocus
          />
        </div>
      )}
      {choiceId === NO_GROUP && locations.length > 0 && (
        <div className="field">
          <label htmlFor="move-location">Location</label>
          <select className="input" id="move-location" value={locationId} onChange={(e) => setLocationId(e.target.value)}>
            <option value="">No location</option>
            {locations.map((l) => (
              <option key={l.id} value={l.id}>{l.name}</option>
            ))}
          </select>
        </div>
      )}
      <div className="dialog-actions">
        <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
        <button type="button" className="btn btn-primary" disabled={isNewGroup && !newGroupName.trim()} onClick={() => void confirm()}>Move</button>
      </div>
    </DialogShell>
  );
}
