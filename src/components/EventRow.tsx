import { Icon } from './icons/Icon';
import type { ScheduleEvent } from '../api/types';
import { formatRange } from '../utils/format';

// 0=Sunday..6=Saturday, Mon-first display order — mirrors AddEventDialog.tsx's own
// WEEKDAYS list (kept as a separate small array rather than a shared import, same
// as this project's other small-and-stable display-label duplications).
const WEEKDAY_LABELS: Record<number, string> = { 1: 'Mon', 2: 'Tue', 3: 'Wed', 4: 'Thu', 5: 'Fri', 6: 'Sat', 0: 'Sun' };

function daysOfWeekLabel(daysOfWeek: number[]): string {
  return [1, 2, 3, 4, 5, 6, 0].filter((d) => daysOfWeek.includes(d)).map((d) => WEEKDAY_LABELS[d]).join(', ');
}

interface EventRowProps {
  event: ScheduleEvent;
  onRemove: () => void;
  onDuplicate: () => void;
}

export function EventRow({ event, onRemove, onDuplicate }: EventRowProps) {
  const count = event.libIds.length;
  return (
    <div className="card" style={{ flexDirection: 'row', alignItems: 'center', gap: 8, padding: '8px 10px' }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600 }}>{event.name}</div>
        <div className="text-muted" style={{ fontSize: 11 }}>
          {formatRange(event.start, event.end)}
          {event.daysOfWeek && event.daysOfWeek.length > 0 ? ` · ${daysOfWeekLabel(event.daysOfWeek)}` : ''}
          {event.startTime && event.endTime ? ` · ${event.startTime}–${event.endTime}` : ''} · {count} item{count === 1 ? '' : 's'}
        </div>
      </div>
      <button type="button" className="btn btn-ghost btn-icon" aria-label="Duplicate event" onClick={onDuplicate}>
        <Icon name="copy" size={13} />
      </button>
      <button type="button" className="btn btn-ghost btn-icon" aria-label="Delete event" onClick={onRemove}>
        <Icon name="trash" size={13} />
      </button>
    </div>
  );
}
