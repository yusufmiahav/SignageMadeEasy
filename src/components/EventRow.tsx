import { Icon } from './icons/Icon';
import type { ScheduleEvent } from '../api/types';
import { formatRange } from '../utils/format';

interface EventRowProps {
  event: ScheduleEvent;
  onRemove: () => void;
}

export function EventRow({ event, onRemove }: EventRowProps) {
  const count = event.libIds.length;
  return (
    <div className="card" style={{ flexDirection: 'row', alignItems: 'center', gap: 8, padding: '8px 10px' }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600 }}>{event.name}</div>
        <div className="text-muted" style={{ fontSize: 11 }}>
          {formatRange(event.start, event.end)} · {count} item{count === 1 ? '' : 's'}
        </div>
      </div>
      <button type="button" className="btn btn-ghost btn-icon" aria-label="Delete event" onClick={onRemove}>
        <Icon name="trash" size={13} />
      </button>
    </div>
  );
}
