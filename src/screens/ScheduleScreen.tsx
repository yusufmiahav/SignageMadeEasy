import { useState } from 'react';
import { Calendar } from '../components/Calendar';
import { PlaylistRow } from '../components/PlaylistRow';
import { EventRow } from '../components/EventRow';
import { DeviceScheduleCard } from '../components/DeviceScheduleCard';
import { Icon } from '../components/icons/Icon';
import type { AppState } from '../hooks/useAppState';
import { activeContentIds, itemsForDate } from '../api/resolve';
import type { LibraryItem } from '../api/types';

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
  onOpenAddContentDevice: (deviceId: string) => void;
  onOpenAddEventDevice: (deviceId: string) => void;
  onPreviewContent: (item: LibraryItem) => void;
}

// Sentinel for the "No location" tab — groups/standalone screens not filed under
// any Location (or filed under one that's since been deleted, e.g. a hand-edited
// backup import — see isUnfiled below), same fallback HomeScreen/SettingsScreen
// already give that case.
const NO_LOCATION = '__none__';

export function ScheduleScreen({ app, onOpenAddContent, onOpenAddEvent, onOpenAddContentDevice, onOpenAddEventDevice, onPreviewContent }: ScheduleScreenProps) {
  const { groups, devices, locations, library, reorderDefaultPlaylist, removeFromDefaultPlaylist, removeEvent, duplicateEvent, setItemDuration } = app;
  const [selectedLocationTab, setSelectedLocationTab] = useState('');
  const [selectedGroupId, setSelectedGroupId] = useState('');
  const [calMonthOffset, setCalMonthOffset] = useState(0);
  const [selectedCalDate, setSelectedCalDate] = useState<string | null>(null);
  const [eventsExpanded, setEventsExpanded] = useState(false);

  const libraryById = new Map(library.map((item) => [item.id, item]));

  // Everything below is scoped to one Location tab at a time — with every group's
  // full schedule editor (calendar, events, default playlist) plus a card per
  // standalone screen all rendering at once, a hub with several locations' worth of
  // screens turned this into one very long page with nothing to do with most of it
  // at a glance. Same "unfiled" fallback as HomeScreen/SettingsScreen for a
  // locationId pointing nowhere real.
  const locationIds = new Set(locations.map((l) => l.id));
  const isUnfiled = (locationId: string | null) => !locationId || !locationIds.has(locationId);
  const locationsWithContent = locations.filter(
    (loc) => groups.some((g) => g.locationId === loc.id) || devices.some((d) => !d.groupId && d.locationId === loc.id),
  );
  const unfiledGroups = groups.filter((g) => isUnfiled(g.locationId));
  const unfiledDevices = devices.filter((d) => !d.groupId && isUnfiled(d.locationId));
  const locationTabs = [
    ...locationsWithContent.map((l) => ({ id: l.id, name: l.name })),
    ...(unfiledGroups.length > 0 || unfiledDevices.length > 0 ? [{ id: NO_LOCATION, name: 'No location' }] : []),
  ];
  const effectiveLocationTab = locationTabs.some((t) => t.id === selectedLocationTab) ? selectedLocationTab : (locationTabs[0]?.id ?? '');
  const tabGroups = effectiveLocationTab === NO_LOCATION ? unfiledGroups : groups.filter((g) => g.locationId === effectiveLocationTab);
  const tabDevices = effectiveLocationTab === NO_LOCATION ? unfiledDevices : devices.filter((d) => !d.groupId && d.locationId === effectiveLocationTab);

  const effectiveGroupId = tabGroups.some((g) => g.id === selectedGroupId) ? selectedGroupId : (tabGroups[0]?.id ?? '');
  const selectedGroup = tabGroups.find((g) => g.id === effectiveGroupId);

  if (devices.length === 0) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <h1 style={{ margin: 0 }}>Schedule</h1>
        <p className="text-muted" style={{ margin: 0 }}>Pair a screen first to build its schedule.</p>
      </div>
    );
  }

  const locationTabBar = locationTabs.length > 1 && (
    <div className="seg" style={{ flexWrap: 'wrap' }}>
      {locationTabs.map((t) => (
        <label key={t.id} className="seg-opt">
          <input type="radio" name="scheduleLocationSel" checked={t.id === effectiveLocationTab} onChange={() => setSelectedLocationTab(t.id)} />
          {t.name}
        </label>
      ))}
    </div>
  );

  if (!selectedGroup) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <h1 style={{ margin: 0 }}>Schedule</h1>
        {locationTabBar}
        {tabDevices.map((device) => (
          <DeviceScheduleCard
            key={device.id}
            app={app}
            device={device}
            library={library}
            onOpenAddContent={onOpenAddContentDevice}
            onOpenAddEvent={onOpenAddEventDevice}
            onPreviewContent={onPreviewContent}
          />
        ))}
      </div>
    );
  }

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

  // A heads-up independent of eventsExpanded/the calendar selection: is there an
  // event scheduled for TODAY specifically (regardless of whether its time window,
  // if any, has started yet)? Uses today's real date, not whatever day is selected
  // in the calendar below.
  const todayForBanner = todayISO();
  const nowForBanner = new Date();
  const hhmmNow = `${pad2(nowForBanner.getHours())}:${pad2(nowForBanner.getMinutes())}`;
  const todaysEvent = selectedGroup.events.find(
    (e) => todayForBanner >= e.start && todayForBanner <= e.end && (!e.daysOfWeek || e.daysOfWeek.length === 0 || e.daysOfWeek.includes(nowForBanner.getDay())),
  );
  const todaysEventIsLive = !!todaysEvent && (!todaysEvent.startTime || !todaysEvent.endTime || (hhmmNow >= todaysEvent.startTime && hhmmNow <= todaysEvent.endTime));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <h1 style={{ margin: 0 }}>Schedule</h1>

      {locationTabBar}

      {tabGroups.length > 0 && (
        <div className="seg" style={{ flexWrap: 'wrap' }}>
          {tabGroups.map((g) => (
            <label key={g.id} className="seg-opt">
              <input type="radio" name="scheduleGroupSel" checked={g.id === effectiveGroupId} onChange={() => setSelectedGroupId(g.id)} />
              {g.name}
            </label>
          ))}
        </div>
      )}

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
        <span className={`tag ${todayTagClass}`} style={{ position: 'absolute', top: 6, left: 6, fontSize: 9, zIndex: 1 }}>{todayLabel}</span>
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
          events={selectedGroup.events}
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
            <button
              type="button"
              className="btn btn-ghost"
              style={{ fontSize: 12, padding: '4px 6px', alignSelf: 'flex-start', gap: 6 }}
              aria-expanded={eventsExpanded}
              onClick={() => setEventsExpanded((v) => !v)}
            >
              <Icon name={eventsExpanded ? 'chevronUp' : 'chevronDown'} size={13} />
              All events ({selectedGroup.events.length})
            </button>
            {eventsExpanded && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {selectedGroup.events.map((ev) => (
                  <EventRow
                    key={ev.id}
                    event={ev}
                    onRemove={() => removeEvent(selectedGroup.id, ev.id)}
                    onDuplicate={() => duplicateEvent(selectedGroup.id, ev.id)}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {tabDevices.map((device) => (
        <DeviceScheduleCard
          key={device.id}
          app={app}
          device={device}
          library={library}
          onOpenAddContent={onOpenAddContentDevice}
          onOpenAddEvent={onOpenAddEventDevice}
          onPreviewContent={onPreviewContent}
        />
      ))}
    </div>
  );
}
