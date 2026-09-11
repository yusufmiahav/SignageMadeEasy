import { Icon } from '../components/icons/Icon';
import { DeviceCard } from '../components/DeviceCard';
import type { AppState } from '../hooks/useAppState';
import { activeAnnouncementId, activeContentIds, nowPlayingItem, nowPlayingName, nowPlayingItemForDevice, nowPlayingNameForDevice } from '../api/resolve';
import type { Device, LibraryItem } from '../api/types';

interface HomeScreenProps {
  app: AppState;
  onAddScreen: () => void;
  onAddLocation: () => void;
  onForceContent: (groupId: string) => void;
  onForceContentAllScreens: () => void;
  onForceAnnouncement: (groupId: string) => void;
  onForceAnnouncementAllScreens: () => void;
  onOpenBlackout: (groupId: string) => void;
  onOpenBlackoutAllScreens: () => void;
  onForceContentForDevice: (deviceId: string) => void;
  onForceAnnouncementForDevice: (deviceId: string) => void;
  onOpenBlackoutForDevice: (deviceId: string) => void;
  onMoveDevice: (device: Device) => void;
  onPickAnnouncement: (device: Device) => void;
  onPreviewContent: (item: LibraryItem) => void;
  advancedDeviceInfo: boolean;
  hideAnnouncementRow: boolean;
}

export function HomeScreen({
  app,
  onAddScreen,
  onAddLocation,
  onForceContent,
  onForceContentAllScreens,
  onForceAnnouncement,
  onForceAnnouncementAllScreens,
  onOpenBlackout,
  onOpenBlackoutAllScreens,
  onForceContentForDevice,
  onForceAnnouncementForDevice,
  onOpenBlackoutForDevice,
  onMoveDevice,
  onPickAnnouncement,
  onPreviewContent,
  advancedDeviceInfo,
  hideAnnouncementRow,
}: HomeScreenProps) {
  const {
    groups, devices, library, renameDevice, restartDevice, removeDevice, toggleDeviceAnnouncement, setDeviceVideoQuality,
    setForcedContent, setForcedAnnouncement, setGroupBlackout, reorderGroups, setDeviceForcedContent, setDeviceBlackout,
  } = app;
  const libraryById = new Map(library.map((item) => [item.id, item]));
  // Every location shows here, even with zero screens paired yet — a location is
  // useful on its own (you can force content/announcements on it, or it's just
  // waiting for a screen to be paired or moved in), and hiding it here while it
  // still shows on Schedule/Settings was confusing.
  const groupsWithDevices = groups.map((group) => ({ group, devices: devices.filter((d) => d.groupId === group.id) }));
  const miscDevices = devices.filter((d) => !d.groupId);

  const moveGroup = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= groups.length) return;
    const reordered = [...groups];
    [reordered[index], reordered[target]] = [reordered[target], reordered[index]];
    void reorderGroups(reordered.map((g) => g.id));
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
        <h1 style={{ margin: 0 }}>Screens</h1>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <button type="button" className="btn btn-warning btn-icon mobile-only" aria-label="Force content on every screen" onClick={onForceContentAllScreens}>
            <Icon name="monitor" size={16} />
          </button>
          <button type="button" className="btn btn-warning desktop-only" onClick={onForceContentAllScreens}>Force content (all screens)</button>
          <button type="button" className="btn btn-warning btn-icon mobile-only" aria-label="Force announcement on every screen" onClick={onForceAnnouncementAllScreens}>
            <Icon name="messageCircle" size={16} />
          </button>
          <button type="button" className="btn btn-warning desktop-only" onClick={onForceAnnouncementAllScreens}>Force announcement (all screens)</button>
          <button type="button" className="btn btn-warning btn-icon mobile-only" aria-label="Blackout every screen" onClick={onOpenBlackoutAllScreens}>
            <Icon name="moon" size={16} />
          </button>
          <button type="button" className="btn btn-warning desktop-only" onClick={onOpenBlackoutAllScreens}>Blackout (all screens)</button>
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
        groupsWithDevices.map(({ group, devices: groupDevices }, index) => {
          const active = activeContentIds(group);
          const forcedItem = group.forcedContentId ? libraryById.get(group.forcedContentId) : undefined;
          const activeAnnId = activeAnnouncementId(group);
          const activeAnnouncement = activeAnnId ? libraryById.get(activeAnnId) : undefined;
          return (
            <div key={group.id} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                    <button
                      type="button"
                      className="btn btn-ghost"
                      aria-label={`Move ${group.name} up`}
                      disabled={index === 0}
                      onClick={() => moveGroup(index, -1)}
                      style={{ width: 28, height: 20, padding: 0, opacity: index === 0 ? 0.3 : 1 }}
                    >
                      <Icon name="chevronUp" size={14} />
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost"
                      aria-label={`Move ${group.name} down`}
                      disabled={index === groups.length - 1}
                      onClick={() => moveGroup(index, 1)}
                      style={{ width: 28, height: 20, padding: 0, opacity: index === groups.length - 1 ? 0.3 : 1 }}
                    >
                      <Icon name="chevronDown" size={14} />
                    </button>
                  </div>
                  <h2 style={{ margin: 0, fontSize: 15 }}>{group.name}</h2>
                  <span className="tag tag-neutral">{groupDevices.length} screen{groupDevices.length === 1 ? '' : 's'}</span>
                  {/* Every screen here shows this regardless of its own manual toggle — see
                      activeAnnouncementId's priority order — so it'd be misleading to leave
                      each DeviceCard's own toggle looking "off" with no explanation here. */}
                  {activeAnnouncement && <span className="tag tag-accent">Announcement: {activeAnnouncement.name}</span>}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  {group.blackout ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span className="tag tag-warning">Blacked out</span>
                      <button type="button" className="btn btn-ghost" style={{ fontSize: 12, padding: '4px 8px' }} onClick={() => setGroupBlackout(group.id, false)}>
                        Stop
                      </button>
                    </div>
                  ) : (
                    <button type="button" className="btn btn-warning" style={{ fontSize: 12, padding: '4px 10px' }} onClick={() => onOpenBlackout(group.id)}>
                      Blackout
                    </button>
                  )}
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
                      nowPlayingItem={nowPlayingItem(group, libraryById)}
                      announcement={device.announcementId ? libraryById.get(device.announcementId) : undefined}
                      onRename={renameDevice}
                      onRestart={restartDevice}
                      onMove={onMoveDevice}
                      onRemove={removeDevice}
                      onPickAnnouncement={onPickAnnouncement}
                      onToggleAnnouncement={toggleDeviceAnnouncement}
                      onSetVideoQuality={setDeviceVideoQuality}
                      onPreview={onPreviewContent}
                      advancedInfo={advancedDeviceInfo}
                      hideAnnouncementRow={hideAnnouncementRow}
                      onForceContent={onForceContentForDevice}
                      onForceAnnouncement={onForceAnnouncementForDevice}
                      onOpenBlackout={onOpenBlackoutForDevice}
                      onStopForcedContent={(id) => setDeviceForcedContent(id, null)}
                      onStopBlackout={(id) => setDeviceBlackout(id, false)}
                    />
                  ))}
                </div>
              )}
            </div>
          );
        })
      )}

      {miscDevices.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <h2 style={{ margin: 0, fontSize: 15 }}>Screens without a location</h2>
            <span className="tag tag-neutral">{miscDevices.length} screen{miscDevices.length === 1 ? '' : 's'}</span>
          </div>
          <hr className="hr" style={{ margin: 0 }} />
          <div className="device-grid">
            {miscDevices.map((device) => (
              <DeviceCard
                key={device.id}
                device={device}
                nowPlaying={nowPlayingNameForDevice(device, libraryById)}
                nowPlayingItem={nowPlayingItemForDevice(device, libraryById)}
                announcement={device.announcementId ? libraryById.get(device.announcementId) : undefined}
                onRename={renameDevice}
                onRestart={restartDevice}
                onMove={onMoveDevice}
                onRemove={removeDevice}
                onPickAnnouncement={onPickAnnouncement}
                onToggleAnnouncement={toggleDeviceAnnouncement}
                onSetVideoQuality={setDeviceVideoQuality}
                onPreview={onPreviewContent}
                advancedInfo={advancedDeviceInfo}
                hideAnnouncementRow={hideAnnouncementRow}
                forcedContentName={device.forcedContentId ? libraryById.get(device.forcedContentId)?.name : undefined}
                onForceContent={onForceContentForDevice}
                onForceAnnouncement={onForceAnnouncementForDevice}
                onOpenBlackout={onOpenBlackoutForDevice}
                onStopForcedContent={(id) => setDeviceForcedContent(id, null)}
                onStopBlackout={(id) => setDeviceBlackout(id, false)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
