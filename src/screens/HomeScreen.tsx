import { Icon } from '../components/icons/Icon';
import { DeviceCard } from '../components/DeviceCard';
import type { AppState } from '../hooks/useAppState';
import { activeAnnouncementId, activeContentIds, nowPlayingName } from '../api/resolve';
import type { Device } from '../api/types';

interface HomeScreenProps {
  app: AppState;
  onAddScreen: () => void;
  onAddLocation: () => void;
  onForceContent: (groupId: string) => void;
  onForceContentAllScreens: () => void;
  onForceAnnouncement: (groupId: string) => void;
  onForceAnnouncementAllScreens: () => void;
  onMoveDevice: (device: Device) => void;
  onPickAnnouncement: (device: Device) => void;
}

export function HomeScreen({
  app,
  onAddScreen,
  onAddLocation,
  onForceContent,
  onForceContentAllScreens,
  onForceAnnouncement,
  onForceAnnouncementAllScreens,
  onMoveDevice,
  onPickAnnouncement,
}: HomeScreenProps) {
  const { groups, devices, library, renameDevice, restartDevice, removeDevice, toggleDeviceAnnouncement, setDeviceVideoQuality, setForcedContent, setForcedAnnouncement } = app;
  const libraryById = new Map(library.map((item) => [item.id, item]));
  // Every location shows here, even with zero screens paired yet — a location is
  // useful on its own (you can force content/announcements on it, or it's just
  // waiting for a screen to be paired or moved in), and hiding it here while it
  // still shows on Schedule/Settings was confusing.
  const groupsWithDevices = groups.map((group) => ({ group, devices: devices.filter((d) => d.groupId === group.id) }));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
        <h1 style={{ margin: 0 }}>Screens</h1>
        <div style={{ display: 'flex', gap: 6 }}>
          <button type="button" className="btn btn-secondary btn-icon mobile-only" aria-label="Force content" onClick={onForceContentAllScreens}>
            <Icon name="monitor" size={16} />
          </button>
          <button type="button" className="btn btn-secondary desktop-only" onClick={onForceContentAllScreens}>Force content</button>
          <button type="button" className="btn btn-secondary btn-icon mobile-only" aria-label="Force announcement" onClick={onForceAnnouncementAllScreens}>
            <Icon name="messageCircle" size={16} />
          </button>
          <button type="button" className="btn btn-secondary desktop-only" onClick={onForceAnnouncementAllScreens}>Force announcement</button>
          <button type="button" className="btn btn-secondary btn-icon mobile-only" aria-label="Add a location" onClick={onAddLocation}>
            <Icon name="mapPin" size={16} />
          </button>
          <button type="button" className="btn btn-secondary desktop-only" onClick={onAddLocation}>Add location</button>
          <button type="button" className="btn btn-primary btn-icon mobile-only" aria-label="Add a screen" onClick={onAddScreen}>
            <Icon name="plus" size={16} />
          </button>
          <button type="button" className="btn btn-primary desktop-only" onClick={onAddScreen}>Add a screen</button>
        </div>
      </div>

      {groups.length === 0 ? (
        <div className="empty-state">
          <Icon name="monitor" size={30} />
          <p className="text-muted" style={{ margin: 0 }}>No screens or locations yet.</p>
          <button type="button" className="btn btn-primary" onClick={onAddScreen}>Add a screen</button>
        </div>
      ) : (
        groupsWithDevices.map(({ group, devices: groupDevices }) => {
          const active = activeContentIds(group);
          const forcedItem = group.forcedContentId ? libraryById.get(group.forcedContentId) : undefined;
          const activeAnnId = activeAnnouncementId(group);
          const activeAnnouncement = activeAnnId ? libraryById.get(activeAnnId) : undefined;
          return (
            <div key={group.id} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <h2 style={{ margin: 0, fontSize: 15 }}>{group.name}</h2>
                  <span className="tag tag-neutral">{groupDevices.length} screen{groupDevices.length === 1 ? '' : 's'}</span>
                  {/* Every screen here shows this regardless of its own manual toggle — see
                      activeAnnouncementId's priority order — so it'd be misleading to leave
                      each DeviceCard's own toggle looking "off" with no explanation here. */}
                  {activeAnnouncement && <span className="tag tag-accent">Announcement: {activeAnnouncement.name}</span>}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  {active.kind === 'forced' ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span className="tag tag-accent">Forced: {forcedItem?.name ?? '—'}</span>
                      <button type="button" className="btn btn-ghost" style={{ fontSize: 12, padding: '4px 8px' }} onClick={() => setForcedContent(group.id, null)}>
                        Stop
                      </button>
                    </div>
                  ) : (
                    <button type="button" className="btn btn-secondary" style={{ fontSize: 12, padding: '4px 10px' }} onClick={() => onForceContent(group.id)}>
                      Force content
                    </button>
                  )}
                  {group.forcedAnnouncementId ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span className="tag tag-accent">Forced: {libraryById.get(group.forcedAnnouncementId)?.name ?? '—'}</span>
                      <button type="button" className="btn btn-ghost" style={{ fontSize: 12, padding: '4px 8px' }} onClick={() => setForcedAnnouncement(group.id, null)}>
                        Stop
                      </button>
                    </div>
                  ) : (
                    <button type="button" className="btn btn-secondary" style={{ fontSize: 12, padding: '4px 10px' }} onClick={() => onForceAnnouncement(group.id)}>
                      Force announcement
                    </button>
                  )}
                </div>
              </div>
              <hr className="hr" style={{ margin: 0 }} />
              {groupDevices.length === 0 ? (
                <p className="text-muted" style={{ margin: 0, fontSize: 13 }}>No screens at this location yet.</p>
              ) : (
                <div className="device-grid">
                  {groupDevices.map((device) => (
                    <DeviceCard
                      key={device.id}
                      device={device}
                      nowPlaying={nowPlayingName(group, libraryById)}
                      announcement={device.announcementId ? libraryById.get(device.announcementId) : undefined}
                      onRename={renameDevice}
                      onRestart={restartDevice}
                      onMove={onMoveDevice}
                      onRemove={removeDevice}
                      onPickAnnouncement={onPickAnnouncement}
                      onToggleAnnouncement={toggleDeviceAnnouncement}
                      onSetVideoQuality={setDeviceVideoQuality}
                    />
                  ))}
                </div>
              )}
            </div>
          );
        })
      )}
    </div>
  );
}
