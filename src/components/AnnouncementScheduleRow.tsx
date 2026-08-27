import { Icon } from './icons/Icon';
import type { AnnouncementSchedule } from '../api/types';
import { formatRange } from '../utils/format';

interface AnnouncementScheduleRowProps {
  schedule: AnnouncementSchedule;
  announcementName: string;
  onRemove: () => void;
}

export function AnnouncementScheduleRow({ schedule, announcementName, onRemove }: AnnouncementScheduleRowProps) {
  return (
    <div className="card" style={{ flexDirection: 'row', alignItems: 'center', gap: 8, padding: '8px 10px' }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600 }}>{announcementName}</div>
        <div className="text-muted" style={{ fontSize: 11 }}>
          {formatRange(schedule.startDate, schedule.endDate)} · {schedule.startTime}–{schedule.endTime} daily
        </div>
      </div>
      <button type="button" className="btn btn-ghost btn-icon" aria-label="Delete schedule" onClick={onRemove}>
        <Icon name="trash" size={13} />
      </button>
    </div>
  );
}
