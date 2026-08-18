import { useState } from 'react';
import { DialogShell } from './DialogShell';
import type { AppState } from '../../hooks/useAppState';

interface AddAnnouncementDialogProps {
  app: AppState;
  onClose: () => void;
}

export function AddAnnouncementDialog({ app, onClose }: AddAnnouncementDialogProps) {
  const { addAnnouncement } = app;
  const [name, setName] = useState('');
  const [text, setText] = useState('');

  const confirm = async () => {
    if (!text.trim()) return;
    await addAnnouncement(name, text);
    onClose();
  };

  return (
    <DialogShell title="Add an announcement" onClose={onClose}>
      <p className="dialog-body" style={{ margin: 0 }}>
        Announcements run as a ticker across the bottom of the screen, over whatever else is playing.
      </p>
      <div className="field">
        <label htmlFor="ann-name">Label (optional)</label>
        <input className="input" id="ann-name" placeholder="e.g. Early closing" value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div className="field">
        <label htmlFor="ann-text">Message</label>
        <textarea className="input" id="ann-text" rows={3} placeholder="We close at 3pm this Friday." value={text} onChange={(e) => setText(e.target.value)} />
      </div>
      <div className="dialog-actions">
        <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
        <button type="button" className="btn btn-primary" onClick={() => void confirm()}>Add</button>
      </div>
    </DialogShell>
  );
}
