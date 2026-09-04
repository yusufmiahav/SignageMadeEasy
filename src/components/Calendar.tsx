import { Icon } from './icons/Icon';
import type { ScheduleEvent } from '../api/types';

const WEEKDAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function toISODate(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

interface CalendarProps {
  /** A location's or a device's own events — whichever this calendar is scoped to. */
  events: ScheduleEvent[];
  monthOffset: number;
  selectedDate: string;
  onSelectDate: (date: string) => void;
  onPrevMonth: () => void;
  onNextMonth: () => void;
}

export function Calendar({ events, monthOffset, selectedDate, onSelectDate, onPrevMonth, onNextMonth }: CalendarProps) {
  const now = new Date();
  const viewed = new Date(now.getFullYear(), now.getMonth() + monthOffset, 1);
  const year = viewed.getFullYear();
  const month = viewed.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const todayStr = toISODate(now);
  const monthLabel = viewed.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });

  const leadingBlanks = viewed.getDay();
  const cells: { day: number; dateStr: string; eventName: string }[] = [];
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${year}-${pad2(month + 1)}-${pad2(d)}`;
    const ev = events.find((e) => dateStr >= e.start && dateStr <= e.end);
    cells.push({ day: d, dateStr, eventName: ev ? ev.name : '' });
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <button type="button" className="btn btn-ghost btn-icon" aria-label="Previous month" onClick={onPrevMonth}>
          <Icon name="chevronLeft" size={14} />
        </button>
        <span style={{ fontSize: 12, fontWeight: 600 }}>{monthLabel}</span>
        <button type="button" className="btn btn-ghost btn-icon" aria-label="Next month" onClick={onNextMonth}>
          <Icon name="chevronRight" size={14} />
        </button>
      </div>
      <div className="calendar-grid">
        {WEEKDAY_LABELS.map((wl, i) => (
          <span key={i} className="calendar-weekday">{wl}</span>
        ))}
        {Array.from({ length: leadingBlanks }).map((_, i) => (
          <span key={`blank-${i}`} className="calendar-cell empty" />
        ))}
        {cells.map((cell) => {
          const isToday = cell.dateStr === todayStr;
          const isSelected = cell.dateStr === selectedDate;
          return (
            <span
              key={cell.dateStr}
              title={cell.eventName}
              className="calendar-cell"
              onClick={() => onSelectDate(cell.dateStr)}
              style={{
                background: cell.eventName ? 'var(--color-accent-100)' : 'transparent',
                color: cell.eventName ? 'var(--color-accent-800)' : 'var(--color-text)',
                fontWeight: isToday || isSelected ? 800 : 400,
                border: isSelected ? '1px solid var(--color-text)' : isToday ? '1px solid var(--color-accent)' : '1px solid transparent',
              }}
            >
              {cell.day}
            </span>
          );
        })}
      </div>
    </div>
  );
}
