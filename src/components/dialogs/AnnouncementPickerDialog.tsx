import { useState } from 'react';
import { DialogShell } from './DialogShell';
import type { AppState } from '../../hooks/useAppState';
import type { Device } from '../../api/types';

interface AnnouncementPickerDialogProps {
  app: AppState;
  device: Device;
  onClose: () => void;
}

export function AnnouncementPickerDialog({ app, device, onClose }: AnnouncementPickerDialogProps) {
  const { library, setDeviceAnnouncement } = app;
  const announcements = library.filter((l) => l.type === 'announcement');
  const [choiceId, setChoiceId] = useState<string | null>(device.announcementId);

  const confirm = async () => {
    await setDeviceAnnouncement(device.id, choiceId);
    onClose();
  };

  return (
    <DialogShell title="Choose an announcement" onClose={onClose}>
      <p className="dialog-body" style={{ margin: 0 }}>
        Runs as a ticker across the bottom of this screen. Use the toggle on the card to turn it on or off any time.
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <label className="radio">
          <input type="radio" name="annPick" checked={choiceId == null} onChange={() => setChoiceId(null)} />
          <span className="dot" />
          None (off)
        </label>
        {announcements.map((a) => (
          <label key={a.id} className="radio">
            <input type="radio" name="annPick" checked={choiceId === a.id} onChange={() => setChoiceId(a.id)} />
            <span className="dot" />
            {a.name}
          </label>
        ))}
      </div>
      <div className="dialog-actions">
        <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
        <button type="button" className="btn btn-primary" onClick={() => void confirm()}>Use</button>
      </div>
    </DialogShell>
  );
}
