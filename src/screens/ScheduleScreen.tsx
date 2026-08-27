import { useState } from 'react';
import { Calendar } from '../components/Calendar';
import { PlaylistRow } from '../components/PlaylistRow';
import { EventRow } from '../components/EventRow';
import type { AppState } from '../hooks/useAppState';
import { activeContentIds, itemsForDate } from '../api/resolve';

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

interface ScheduleScreenProps {
  app: AppState;
  onOpenAddContent: (groupId: string) => void;
  onOpenAddEvent: (groupId: string) => void;
}

export function ScheduleScreen({ app, onOpenAddContent, onOpenAddEvent }: ScheduleScreenProps) {
  const { groups, devices, library, reorderDefaultPlaylist, removeFromDefaultPlaylist, removeEvent, setItemDuration } = app;
  const [selectedGroupId, setSelectedGroupId] = useState(groups[0]?.id ?? '');
  const [calMonthOffset, setCalMonthOffset] = useState(0);
  const [selectedCalDate, setSelectedCalDate] = useState<string | null>(null);

  const libraryById = new Map(library.map((item) => [item.id, item]));
  const effectiveGroupId = groups.some((g) => g.id === selectedGroupId) ? selectedGroupId : (groups[0]?.id ?? '');
  const selectedGroup = groups.find((g) => g.id === effectiveGroupId);

  if (devices.length === 0) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <h1 style={{ margin: 0 }}>Schedule</h1>
        <p className="text-muted" style={{ margin: 0 }}>Pair a screen first to build its schedule.</p>
      </div>
    );
  }

  if (!selectedGroup) return null;

  const effectiveDate = selectedCalDate ?? todayISO();
  const active = activeContentIds(selectedGroup);
  const nowPlayingItem = active.ids.length > 0 ? libraryById.get(active.ids[0]) : undefined;
  const todayLabel = active.kind === 'forced' ? 'FORCED · 1920×1080' : active.kind === 'event' ? 'EVENT · 1920×1080' : 'DEFAULT · 1920×1080';
  const todayTagClass = active.kind === 'forced' || active.kind === 'event' ? 'tag-accent' : 'tag-outline';

  const dayInfo = itemsForDate(selectedGroup, effectiveDate);
  const selectedDateLabel = new Date(`${effectiveDate}T00:00:00`).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
  const selectedDayItems = dayInfo.ids.map((id) => libraryById.get(id)).filter((i): i is NonNullable<typeof i> => !!i);
  const selectedDayTagClass = dayInfo.kind === 'event' ? 'tag-accent' : 'tag-outline';

  const defaultItems = selectedGroup.defaultPlaylist
    .map((id) => libraryById.get(id))
    .filter((i): i is NonNullable<typeof i> => !!i);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <h1 style={{ margin: 0 }}>Schedule</h1>

      <div className="seg" style={{ flexWrap: 'wrap' }}>
        {groups.map((g) => (
          <label key={g.id} className="seg-opt">
            <input type="radio" name="scheduleGroupSel" checked={g.id === effectiveGroupId} onChange={() => setSelectedGroupId(g.id)} />
            {g.name}
          </label>
        ))}
      </div>

      <div className="preview-box">
        <span className={`tag ${todayTagClass}`} style={{ position: 'absolute', top: 6, left: 6, fontSize: 9 }}>{todayLabel}</span>
        <span className="preview-box-label" style={{ fontSize: 13 }}>{nowPlayingItem ? nowPlayingItem.name : '—'}</span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <h2 style={{ margin: 0, fontSize: 13, textTransform: 'uppercase', letterSpacing: '0.06em', opacity: 0.6 }}>Every day</h2>
        {defaultItems.length === 0 ? (
          <p className="text-muted" style={{ margin: 0, fontSize: 13 }}>Nothing yet — add from your library.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {defaultItems.map((item, i) => (
              <PlaylistRow
                key={item.id}
                item={item}
                order={i + 1}
                upDisabled={i === 0}
                downDisabled={i === defaultItems.length - 1}
                onMoveUp={() => reorderDefaultPlaylist(selectedGroup.id, item.id, 'up')}
                onMoveDown={() => reorderDefaultPlaylist(selectedGroup.id, item.id, 'down')}
                onRemove={() => removeFromDefaultPlaylist(selectedGroup.id, item.id)}
                onSetDuration={(durationSec) => setItemDuration(item.id, durationSec)}
              />
            ))}
          </div>
        )}
        <button type="button" className="btn btn-secondary btn-block" style={{ marginTop: 0 }} onClick={() => onOpenAddContent(selectedGroup.id)}>
          Add content
        </button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h2 style={{ margin: 0, fontSize: 13, textTransform: 'uppercase', letterSpacing: '0.06em', opacity: 0.6 }}>Events</h2>
          <button type="button" className="btn btn-ghost" style={{ fontSize: 12, padding: '4px 6px' }} onClick={() => onOpenAddEvent(selectedGroup.id)}>
            + Add event
          </button>
        </div>

        <Calendar
          group={selectedGroup}
          monthOffset={calMonthOffset}
          selectedDate={effectiveDate}
          onSelectDate={setSelectedCalDate}
          onPrevMonth={() => setCalMonthOffset((o) => o - 1)}
          onNextMonth={() => setCalMonthOffset((o) => o + 1)}
        />

        <div className="card" style={{ gap: 6 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 13, fontWeight: 600 }}>{selectedDateLabel}</span>
            <span className={`tag ${selectedDayTagClass}`}>{dayInfo.label}</span>
          </div>
          {selectedDayItems.length === 0 ? (
            <p className="text-muted" style={{ margin: 0, fontSize: 12 }}>Nothing scheduled.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {selectedDayItems.map((item) => (
                <div key={item.id} className="text-muted" style={{ fontSize: 12 }}>{item.name}</div>
              ))}
            </div>
          )}
        </div>

        {selectedGroup.events.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 4 }}>
            {selectedGroup.events.map((ev) => (
              <EventRow key={ev.id} event={ev} onRemove={() => removeEvent(selectedGroup.id, ev.id)} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
