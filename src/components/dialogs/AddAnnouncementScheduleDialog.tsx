import { useState } from 'react';
import { DialogShell } from './DialogShell';
import type { AppState } from '../../hooks/useAppState';

function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

interface AddAnnouncementScheduleDialogProps {
  app: AppState;
  groupId: string;
  onClose: () => void;
}

export function AddAnnouncementScheduleDialog({ app, groupId, onClose }: AddAnnouncementScheduleDialogProps) {
  const { library, addAnnouncementSchedule } = app;
  const announcements = library.filter((l) => l.type === 'announcement');
  const [announcementId, setAnnouncementId] = useState(announcements[0]?.id ?? '');
  const [startDate, setStartDate] = useState(todayISO());
  const [endDate, setEndDate] = useState(todayISO());
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('17:00');

  const confirm = async () => {
    if (!announcementId || !startDate || !endDate || !startTime || !endTime) return;
    await addAnnouncementSchedule(groupId, { announcementId, startDate, endDate, startTime, endTime });
    onClose();
  };

  return (
    <DialogShell title="Schedule an announcement" onClose={onClose}>
      {announcements.length === 0 ? (
        <p className="dialog-body">Add an announcement from the Library first.</p>
      ) : (
        <>
          <div className="field">
            <label htmlFor="as-announcement">Announcement</label>
            <select id="as-announcement" className="input" value={announcementId} onChange={(e) => setAnnouncementId(e.target.value)}>
              {announcements.map((a) => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div className="field">
              <label htmlFor="as-start-date">Starts</label>
              <input className="input" id="as-start-date" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="as-end-date">Ends</label>
              <input className="input" id="as-end-date" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="as-start-time">On from</label>
              <input className="input" id="as-start-time" type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="as-end-time">Until</label>
              <input className="input" id="as-end-time" type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
            </div>
          </div>
          <p className="dialog-body text-muted" style={{ fontSize: 12 }}>
            Runs every day within the date range, only during that daily time window. Doesn't support a window that
            crosses midnight (e.g. 10pm–2am).
          </p>
        </>
      )}
      <div className="dialog-actions">
        <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
        <button type="button" className="btn btn-primary" disabled={announcements.length === 0} onClick={() => void confirm()}>Add schedule</button>
      </div>
    </DialogShell>
  );
}
