import { useState } from 'react';
import { AnnouncementScheduleRow } from '../components/AnnouncementScheduleRow';
import type { AppState } from '../hooks/useAppState';
import { activeAnnouncementId } from '../api/resolve';

interface AnnouncementsScreenProps {
  app: AppState;
  onOpenForceAnnouncement: (groupId: string) => void;
  onOpenAddSchedule: (groupId: string) => void;
}

export function AnnouncementsScreen({ app, onOpenForceAnnouncement, onOpenAddSchedule }: AnnouncementsScreenProps) {
  const { groups, devices, library, removeAnnouncementSchedule, setForcedAnnouncement } = app;
  const [selectedGroupId, setSelectedGroupId] = useState(groups[0]?.id ?? '');
  const libraryById = new Map(library.map((item) => [item.id, item]));
  const effectiveGroupId = groups.some((g) => g.id === selectedGroupId) ? selectedGroupId : (groups[0]?.id ?? '');
  const selectedGroup = groups.find((g) => g.id === effectiveGroupId);

  if (devices.length === 0) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <h1 style={{ margin: 0 }}>Announcements</h1>
        <p className="text-muted" style={{ margin: 0 }}>Pair a screen first to manage announcements.</p>
      </div>
    );
  }

  if (!selectedGroup) return null;

  const activeId = activeAnnouncementId(selectedGroup);
  const activeItem = activeId ? libraryById.get(activeId) : undefined;
  const forcedItem = selectedGroup.forcedAnnouncementId ? libraryById.get(selectedGroup.forcedAnnouncementId) : undefined;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <h1 style={{ margin: 0 }}>Announcements</h1>
      <p className="text-muted" style={{ margin: 0, fontSize: 13 }}>
        Runs as a ticker overlay regardless of what's playing — create the announcement text itself from the Library,
        then turn it on or schedule it here. Use "Force announcement" on the Home tab to turn one on for every
        screen everywhere at once.
      </p>

      <div className="seg" style={{ flexWrap: 'wrap' }}>
        {groups.map((g) => (
          <label key={g.id} className="seg-opt">
            <input type="radio" name="announceGroupSel" checked={g.id === effectiveGroupId} onChange={() => setSelectedGroupId(g.id)} />
            {g.name}
          </label>
        ))}
      </div>

      <div className="card" style={{ gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div className="card-kicker">This location</div>
          {activeItem && <span className="tag tag-accent">On now: {activeItem.name}</span>}
        </div>
        {forcedItem ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span className="tag tag-accent">Forced: {forcedItem.name}</span>
            <button
              type="button"
              className="btn btn-ghost"
              style={{ fontSize: 12, padding: '4px 8px' }}
              onClick={() => void setForcedAnnouncement(selectedGroup.id, null)}
            >
              Stop
            </button>
          </div>
        ) : (
          <button
            type="button"
            className="btn btn-secondary"
            style={{ alignSelf: 'flex-start', fontSize: 12, padding: '4px 10px' }}
            onClick={() => onOpenForceAnnouncement(selectedGroup.id)}
          >
            Force on for this location
          </button>
        )}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h2 style={{ margin: 0, fontSize: 13, textTransform: 'uppercase', letterSpacing: '0.06em', opacity: 0.6 }}>Schedules</h2>
          <button type="button" className="btn btn-ghost" style={{ fontSize: 12, padding: '4px 6px' }} onClick={() => onOpenAddSchedule(selectedGroup.id)}>
            + Add schedule
          </button>
        </div>
        {selectedGroup.announcementSchedules.length === 0 ? (
          <p className="text-muted" style={{ margin: 0, fontSize: 13 }}>Nothing scheduled at this location.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {selectedGroup.announcementSchedules.map((s) => (
              <AnnouncementScheduleRow
                key={s.id}
                schedule={s}
                announcementName={libraryById.get(s.announcementId)?.name ?? '—'}
                onRemove={() => removeAnnouncementSchedule(selectedGroup.id, s.id)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
