import { Icon } from '../components/icons/Icon';
import { DeviceCard } from '../components/DeviceCard';
import type { AppState } from '../hooks/useAppState';
import { activeAnnouncementId, activeContentIds, nowPlayingItem, nowPlayingName, nowPlayingItemForDevice, nowPlayingNameForDevice } from '../api/resolve';
import type { Device, Group, LibraryItem } from '../api/types';

interface HomeScreenProps {
  app: AppState;
  onAddScreen: () => void;
  /** Purely-organizational Location, for browsing/managing a whole site at once — see api/types.ts's Location. */
  onAddLocation: () => void;
  /** A group of screens sharing one playlist/schedule — `locationId` pre-files it under that Location when opened from within a Location's section, null from the header. */
  onAddGroup: (locationId: string | null) => void;
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
  onAddGroup,
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
    groups, devices, locations, library, renameDevice, restartDevice, removeDevice, toggleDeviceAnnouncement, setDeviceVideoQuality,
    setForcedContent, setForcedAnnouncement, setGroupBlackout, reorderGroups, setDeviceForcedContent, setDeviceBlackout,
  } = app;
  const libraryById = new Map(library.map((item) => [item.id, item]));
  // A locationId pointing at a Location that no longer exists (e.g. a hand-edited or
  // partial backup import) is treated the same as no locationId at all — otherwise a
  // group/device like that would render in neither its (nonexistent) Location's
  // section nor this top-level bucket, silently disappearing from view entirely.
  const locationIds = new Set(locations.map((l) => l.id));
  const isUnfiled = (locationId: string | null) => !locationId || !locationIds.has(locationId);
  // Groups filed under a Location render inside that Location's own section below;
  // these are the ones left over — either genuinely standalone or waiting to be filed.
  const topLevelGroups = groups.filter((g) => isUnfiled(g.locationId));
  // Same split for standalone screens: one filed under a Location shows in that
  // Location's section instead of this fully-unassigned bucket.
  const fullyUnassignedDevices = devices.filter((d) => !d.groupId && isUnfiled(d.locationId));
  const isEmpty = locations.length === 0 && groups.length === 0 && devices.length === 0;

  // `reorderGroups`/the backend's sortOrder is one global sequence, not scoped per
  // Location — so "moving" a group within its own section (a Location's groups, or
  // the top-level list) means finding where its two on-screen neighbors sit in the
  // GLOBAL groups array and swapping just those two positions, then sending the
  // complete reordered list back.
  const moveGroupInScope = (scopeGroups: Group[], groupId: string, direction: -1 | 1) => {
    const idx = scopeGroups.findIndex((g) => g.id === groupId);
    const target = idx + direction;
    if (idx < 0 || target < 0 || target >= scopeGroups.length) return;
    const fullIds = groups.map((g) => g.id);
    const posA = fullIds.indexOf(scopeGroups[idx].id);
    const posB = fullIds.indexOf(scopeGroups[target].id);
    [fullIds[posA], fullIds[posB]] = [fullIds[posB], fullIds[posA]];
    void reorderGroups(fullIds);
  };

  const renderGroupSection = (group: Group, scopeGroups: Group[]) => {
    const index = scopeGroups.findIndex((g) => g.id === group.id);
    const groupDevices = devices.filter((d) => d.groupId === group.id);
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
                onClick={() => moveGroupInScope(scopeGroups, group.id, -1)}
                style={{ width: 28, height: 20, padding: 0, opacity: index === 0 ? 0.3 : 1 }}
              >
                <Icon name="chevronUp" size={14} />
              </button>
              <button
                type="button"
                className="btn btn-ghost"
                aria-label={`Move ${group.name} down`}
                disabled={index === scopeGroups.length - 1}
                onClick={() => moveGroupInScope(scopeGroups, group.id, 1)}
                style={{ width: 28, height: 20, padding: 0, opacity: index === scopeGroups.length - 1 ? 0.3 : 1 }}
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
          <p className="text-muted" style={{ margin: 0, fontSize: 13 }}>No screens in this group yet.</p>
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
  };

  const renderDeviceGrid = (deviceList: Device[]) => (
    <div className="device-grid">
      {deviceList.map((device) => (
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
  );

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
          <button type="button" className="btn btn-secondary btn-icon mobile-only" aria-label="Add a group" onClick={() => onAddGroup(null)}>
            <Icon name="grid" size={16} />
          </button>
          <button type="button" className="btn btn-secondary desktop-only" onClick={() => onAddGroup(null)}>Add group</button>
          <button type="button" className="btn btn-primary btn-icon mobile-only" aria-label="Add a screen" onClick={onAddScreen}>
            <Icon name="plus" size={16} />
          </button>
          <button type="button" className="btn btn-primary desktop-only" onClick={onAddScreen}>Add a screen</button>
        </div>
      </div>

      {isEmpty ? (
        <div className="empty-state">
          <Icon name="monitor" size={30} />
          <p className="text-muted" style={{ margin: 0 }}>No screens, groups, or locations yet.</p>
          <button type="button" className="btn btn-primary" onClick={onAddScreen}>Add a screen</button>
        </div>
      ) : (
        <>
          {locations.map((location) => {
            const locationGroups = groups.filter((g) => g.locationId === location.id);
            const locationDevices = devices.filter((d) => !d.groupId && d.locationId === location.id);
            const locationEmpty = locationGroups.length === 0 && locationDevices.length === 0;
            return (
              <div
                key={location.id}
                style={{ display: 'flex', flexDirection: 'column', gap: 14, padding: 12, border: '1px solid var(--color-divider)', borderRadius: 'var(--radius-md)' }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <Icon name="mapPin" size={16} style={{ opacity: 0.6, flexShrink: 0 }} />
                  <h2 style={{ margin: 0, fontSize: 16 }}>{location.name}</h2>
                  <span className="tag tag-neutral">
                    {locationGroups.length} group{locationGroups.length === 1 ? '' : 's'} · {locationDevices.length} screen{locationDevices.length === 1 ? '' : 's'}
                  </span>
                  <button
                    type="button"
                    className="btn btn-ghost"
                    style={{ fontSize: 12, padding: '4px 8px', marginLeft: 'auto' }}
                    onClick={() => onAddGroup(location.id)}
                  >
                    <Icon name="grid" size={13} /> Add group here
                  </button>
                </div>
                {locationEmpty ? (
                  <p className="text-muted" style={{ margin: 0, fontSize: 13 }}>No groups or screens in this location yet.</p>
                ) : (
                  <>
                    {locationGroups.map((group) => renderGroupSection(group, locationGroups))}
                    {locationDevices.length > 0 && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                          <h3 style={{ margin: 0, fontSize: 13, opacity: 0.75 }}>Standalone screens</h3>
                          <span className="tag tag-neutral">{locationDevices.length} screen{locationDevices.length === 1 ? '' : 's'}</span>
                        </div>
                        {renderDeviceGrid(locationDevices)}
                      </div>
                    )}
                  </>
                )}
              </div>
            );
          })}

          {topLevelGroups.map((group) => renderGroupSection(group, topLevelGroups))}

          {fullyUnassignedDevices.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <h2 style={{ margin: 0, fontSize: 15 }}>Screens without a group</h2>
                <span className="tag tag-neutral">{fullyUnassignedDevices.length} screen{fullyUnassignedDevices.length === 1 ? '' : 's'}</span>
              </div>
              <hr className="hr" style={{ margin: 0 }} />
              {renderDeviceGrid(fullyUnassignedDevices)}
            </div>
          )}
        </>
      )}
    </div>
  );
}
