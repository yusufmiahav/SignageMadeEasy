import { useState } from 'react';
import { Calendar } from './Calendar';
import { PlaylistRow } from './PlaylistRow';
import { EventRow } from './EventRow';
import { Icon } from './icons/Icon';
import type { AppState } from '../hooks/useAppState';
import { activeContentIdsForDevice, itemsForDateForDevice } from '../api/resolve';
import type { Device, LibraryItem } from '../api/types';

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

interface DeviceScheduleCardProps {
  app: AppState;
  device: Device;
  library: LibraryItem[];
  onOpenAddContent: (deviceId: string) => void;
  onOpenAddEvent: (deviceId: string) => void;
  onPreviewContent: (item: LibraryItem) => void;
}

/**
 * One misc/no-location screen's own schedule editor — a compact copy of the
 * location-scoped UI above it in ScheduleScreen, since a misc screen has its own
 * independent default playlist + events instead of sharing a location's. Rendered
 * as a stacked list (one card per screen, one after another down the page) rather
 * than behind a single selector like locations use — there's no shared "current
 * location" concept to switch between for screens that don't belong to any.
 */
export function DeviceScheduleCard({ app, device, library, onOpenAddContent, onOpenAddEvent, onPreviewContent }: DeviceScheduleCardProps) {
  const { reorderDeviceDefaultPlaylist, removeFromDeviceDefaultPlaylist, removeDeviceEvent, duplicateDeviceEvent, setItemDuration } = app;
  const [calMonthOffset, setCalMonthOffset] = useState(0);
  const [selectedCalDate, setSelectedCalDate] = useState<string | null>(null);
  const [eventsExpanded, setEventsExpanded] = useState(false);

  const libraryById = new Map(library.map((item) => [item.id, item]));
  const effectiveDate = selectedCalDate ?? todayISO();
  const active = activeContentIdsForDevice(device);
  const nowPlayingItem = active.ids.length > 0 ? libraryById.get(active.ids[0]) : undefined;
  const todayLabel = active.kind === 'forced' ? 'FORCED' : active.kind === 'event' ? 'EVENT' : active.kind === 'blackout' ? 'BLACKOUT' : 'DEFAULT';
  const todayTagClass = active.kind === 'forced' || active.kind === 'event' ? 'tag-accent' : 'tag-outline';

  const dayInfo = itemsForDateForDevice(device, effectiveDate);
  const selectedDateLabel = new Date(`${effectiveDate}T00:00:00`).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
  const selectedDayItems = dayInfo.ids.map((id) => libraryById.get(id)).filter((i): i is NonNullable<typeof i> => !!i);
  const selectedDayTagClass = dayInfo.kind === 'event' ? 'tag-accent' : 'tag-outline';

  const defaultItems = device.defaultPlaylist
    .map((id) => libraryById.get(id))
    .filter((i): i is NonNullable<typeof i> => !!i);

  const todayForBanner = todayISO();
  const nowForBanner = new Date();
  const hhmmNow = `${pad2(nowForBanner.getHours())}:${pad2(nowForBanner.getMinutes())}`;
  const todaysEvent = device.events.find((e) => todayForBanner >= e.start && todayForBanner <= e.end);
  const todaysEventIsLive = !!todaysEvent && (!todaysEvent.startTime || !todaysEvent.endTime || (hhmmNow >= todaysEvent.startTime && hhmmNow <= todaysEvent.endTime));

  return (
    <div className="card" style={{ gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 600 }}>{device.name}</div>
          <div className="text-muted" style={{ fontSize: 11 }}>No location</div>
        </div>
        <span className={`tag ${todayTagClass}`} style={{ fontSize: 9 }}>{todayLabel}</span>
      </div>

      {todaysEvent && (
        <div className="dialog-warning">
          <Icon name="alertTriangle" size={16} />
          <span>
            {todaysEvent.startTime && todaysEvent.endTime
              ? `! EVENT TODAY AT ${todaysEvent.startTime}–${todaysEvent.endTime} "${todaysEvent.name}" ${todaysEventIsLive ? 'is playing' : 'will play'} !`
              : `! EVENT TODAY — "${todaysEvent.name}" is playing all day !`}
          </span>
        </div>
      )}

      <div
        className={`preview-box preview-box-compact${active.kind === 'forced' ? ' preview-box-forced' : ''}`}
        style={
          nowPlayingItem?.type === 'image' && nowPlayingItem.thumb
            ? { backgroundImage: `url(${nowPlayingItem.thumb})`, backgroundSize: 'cover', backgroundPosition: 'center' }
            : undefined
        }
      >
        {!(nowPlayingItem?.type === 'image' && nowPlayingItem.thumb) && (
          <span className="preview-box-label" style={{ fontSize: 13 }}>{nowPlayingItem ? nowPlayingItem.name : '—'}</span>
        )}
        {nowPlayingItem && (
          <button
            type="button"
            className="btn btn-ghost btn-icon thumb-remove"
            aria-label="Preview content"
            title="Preview what this screen would actually show"
            style={{ zIndex: 1 }}
            onClick={() => onPreviewContent(nowPlayingItem)}
          >
            <Icon name="eye" size={13} />
          </button>
        )}
        {active.kind === 'forced' && (
          <div className="force-watermark" aria-hidden="true">
            {Array.from({ length: 14 }, (_, i) => (
              <span key={i}>Force content enabled</span>
            ))}
          </div>
        )}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <h3 style={{ margin: 0, fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.06em', opacity: 0.6 }}>Every day</h3>
        {defaultItems.length === 0 ? (
          <p className="text-muted" style={{ margin: 0, fontSize: 12 }}>Nothing yet — add from your library.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {defaultItems.map((item, i) => (
              <PlaylistRow
                key={item.id}
                item={item}
                order={i + 1}
                upDisabled={i === 0}
                downDisabled={i === defaultItems.length - 1}
                onMoveUp={() => reorderDeviceDefaultPlaylist(device.id, item.id, 'up')}
                onMoveDown={() => reorderDeviceDefaultPlaylist(device.id, item.id, 'down')}
                onRemove={() => removeFromDeviceDefaultPlaylist(device.id, item.id)}
                onSetDuration={(durationSec) => setItemDuration(item.id, durationSec)}
              />
            ))}
          </div>
        )}
        <button type="button" className="btn btn-secondary btn-block" style={{ marginTop: 0 }} onClick={() => onOpenAddContent(device.id)}>
          Add content
        </button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h3 style={{ margin: 0, fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.06em', opacity: 0.6 }}>Events</h3>
          <button type="button" className="btn btn-ghost" style={{ fontSize: 12, padding: '4px 6px' }} onClick={() => onOpenAddEvent(device.id)}>
            + Add event
          </button>
        </div>

        <Calendar
          events={device.events}
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

        {device.events.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 4 }}>
            <button
              type="button"
              className="btn btn-ghost"
              style={{ fontSize: 12, padding: '4px 6px', alignSelf: 'flex-start', gap: 6 }}
              aria-expanded={eventsExpanded}
              onClick={() => setEventsExpanded((v) => !v)}
            >
              <Icon name={eventsExpanded ? 'chevronUp' : 'chevronDown'} size={13} />
              All events ({device.events.length})
            </button>
            {eventsExpanded && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {device.events.map((ev) => (
                  <EventRow
                    key={ev.id}
                    event={ev}
                    onRemove={() => removeDeviceEvent(device.id, ev.id)}
                    onDuplicate={() => duplicateDeviceEvent(device.id, ev.id)}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
