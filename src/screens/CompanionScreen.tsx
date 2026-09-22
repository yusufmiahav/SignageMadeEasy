import { Icon } from '../components/icons/Icon';
import type { AppState } from '../hooks/useAppState';
import { activeAnnouncementId, activeContentIds, activeContentIdsForDevice } from '../api/resolve';
import type { Device, Group } from '../api/types';

interface CompanionScreenProps {
  app: AppState;
  onForceContent: (groupId: string) => void;
  onForceContentAllScreens: () => void;
  onForceAnnouncement: (groupId: string) => void;
  onForceAnnouncementAllScreens: () => void;
  onOpenBlackout: (groupId: string) => void;
  onOpenBlackoutAllScreens: () => void;
  onForceContentForDevice: (deviceId: string) => void;
  onForceAnnouncementForDevice: (deviceId: string) => void;
  onOpenBlackoutForDevice: (deviceId: string) => void;
}

/**
 * A fast, single-purpose "ops board" for the actions someone needs in a hurry
 * (something's wrong, or an event is starting) — force/clear content, flash a
 * screen to find it, blackout, and announcements, for one group/screen or every
 * screen at once, without navigating Home's fuller per-screen management UI.
 * Reuses the exact same force/blackout dialogs and app-state actions Home already
 * uses, just surfaced as one flat list instead of nested inside each group's card.
 */
export function CompanionScreen({
  app,
  onForceContent,
  onForceContentAllScreens,
  onForceAnnouncement,
  onForceAnnouncementAllScreens,
  onOpenBlackout,
  onOpenBlackoutAllScreens,
  onForceContentForDevice,
  onForceAnnouncementForDevice,
  onOpenBlackoutForDevice,
}: CompanionScreenProps) {
  const {
    groups, devices, library,
    setForcedContent, forceContentAllScreens,
    setForcedAnnouncement, forceAnnouncementAllScreens,
    setGroupBlackout, blackoutAllScreens,
    setDeviceForcedContent, setDeviceAnnouncement, setDeviceBlackout,
    flashDevice, flashGroup, flashAllScreens,
  } = app;
  const libraryById = new Map(library.map((item) => [item.id, item]));
  const onlineCount = devices.filter((d) => d.status === 'online').length;
  const standaloneDevices = devices.filter((d) => !d.groupId);
  const isEmpty = groups.length === 0 && devices.length === 0;

  const renderGroupRow = (group: Group) => {
    const groupDevices = devices.filter((d) => d.groupId === group.id);
    const onlineInGroup = groupDevices.filter((d) => d.status === 'online').length;
    const active = activeContentIds(group);
    const forcedItem = group.forcedContentId ? libraryById.get(group.forcedContentId) : undefined;
    const activeAnnId = activeAnnouncementId(group);
    const activeAnnouncement = activeAnnId ? libraryById.get(activeAnnId) : undefined;
    return (
      <div key={group.id} className="card" style={{ gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <Icon name="grid" size={15} style={{ opacity: 0.7, flexShrink: 0 }} />
          <span className="card-title" style={{ flex: 1, minWidth: 0 }}>{group.name}</span>
          <span className="tag tag-neutral">{onlineInGroup}/{groupDevices.length} online</span>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6 }}>
          {group.blackout ? (
            <>
              <span className="tag tag-warning">Blacked out</span>
              <button type="button" className="btn btn-ghost" style={{ fontSize: 12, padding: '4px 8px' }} onClick={() => setGroupBlackout(group.id, false)}>
                Clear
              </button>
            </>
          ) : (
            <button type="button" className="btn btn-warning" style={{ fontSize: 12, padding: '4px 10px' }} onClick={() => onOpenBlackout(group.id)}>
              <Icon name="moon" size={13} /> Blackout
            </button>
          )}
          {active.kind === 'forced' ? (
            <>
              <span className="tag tag-accent">Forced: {forcedItem?.name ?? '—'}</span>
              <button type="button" className="btn btn-ghost" style={{ fontSize: 12, padding: '4px 8px' }} onClick={() => setForcedContent(group.id, null)}>
                Clear
              </button>
            </>
          ) : (
            <button type="button" className="btn btn-secondary" style={{ fontSize: 12, padding: '4px 10px' }} onClick={() => onForceContent(group.id)}>
              <Icon name="monitor" size={13} /> Force content
            </button>
          )}
          {activeAnnouncement ? (
            <>
              <span className="tag tag-accent">Announcement: {activeAnnouncement.name}</span>
              <button type="button" className="btn btn-ghost" style={{ fontSize: 12, padding: '4px 8px' }} onClick={() => setForcedAnnouncement(group.id, null)}>
                Clear
              </button>
            </>
          ) : (
            <button type="button" className="btn btn-secondary" style={{ fontSize: 12, padding: '4px 10px' }} onClick={() => onForceAnnouncement(group.id)}>
              <Icon name="messageCircle" size={13} /> Force announcement
            </button>
          )}
          <button
            type="button"
            className="btn btn-secondary"
            style={{ fontSize: 12, padding: '4px 10px' }}
            disabled={groupDevices.length === 0}
            title="Briefly flash every screen in this group white, to spot which one it is"
            onClick={() => void flashGroup(group)}
          >
            <Icon name="zap" size={13} /> Flash
          </button>
        </div>
      </div>
    );
  };

  const renderDeviceRow = (device: Device) => {
    const active = activeContentIdsForDevice(device);
    const forcedItem = device.forcedContentId ? libraryById.get(device.forcedContentId) : undefined;
    const announcement = device.announcementId ? libraryById.get(device.announcementId) : undefined;
    return (
      <div key={device.id} className="card" style={{ gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className={`status-dot ${device.status}`} />
          <span className="card-title" style={{ flex: 1, minWidth: 0 }}>{device.name}</span>
          <span className="tag tag-neutral">{device.status === 'online' ? 'Online' : 'Offline'}</span>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6 }}>
          {device.blackout ? (
            <>
              <span className="tag tag-warning">Blacked out</span>
              <button type="button" className="btn btn-ghost" style={{ fontSize: 12, padding: '4px 8px' }} onClick={() => setDeviceBlackout(device.id, false)}>
                Clear
              </button>
            </>
          ) : (
            <button type="button" className="btn btn-warning" style={{ fontSize: 12, padding: '4px 10px' }} onClick={() => onOpenBlackoutForDevice(device.id)}>
              <Icon name="moon" size={13} /> Blackout
            </button>
          )}
          {active.kind === 'forced' ? (
            <>
              <span className="tag tag-accent">Forced: {forcedItem?.name ?? '—'}</span>
              <button type="button" className="btn btn-ghost" style={{ fontSize: 12, padding: '4px 8px' }} onClick={() => setDeviceForcedContent(device.id, null)}>
                Clear
              </button>
            </>
          ) : (
            <button type="button" className="btn btn-secondary" style={{ fontSize: 12, padding: '4px 10px' }} onClick={() => onForceContentForDevice(device.id)}>
              <Icon name="monitor" size={13} /> Force content
            </button>
          )}
          {/* A standalone screen has no separate "forced" field — its own
              announcementId + announcementOn IS the forcing mechanism, so this
              reads/clears those directly rather than a group-style forcedAnnouncementId. */}
          {announcement && device.announcementOn ? (
            <>
              <span className="tag tag-accent">Announcement: {announcement.name}</span>
              <button type="button" className="btn btn-ghost" style={{ fontSize: 12, padding: '4px 8px' }} onClick={() => setDeviceAnnouncement(device.id, null)}>
                Clear
              </button>
            </>
          ) : (
            <button type="button" className="btn btn-secondary" style={{ fontSize: 12, padding: '4px 10px' }} onClick={() => onForceAnnouncementForDevice(device.id)}>
              <Icon name="messageCircle" size={13} /> Force announcement
            </button>
          )}
          <button
            type="button"
            className="btn btn-secondary"
            style={{ fontSize: 12, padding: '4px 10px' }}
            title="Briefly flash this screen white, to spot which one it is"
            onClick={() => void flashDevice(device)}
          >
            <Icon name="zap" size={13} /> Flash
          </button>
        </div>
      </div>
    );
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
        <h1 style={{ margin: 0 }}>Companion</h1>
        <span className="tag tag-neutral">{onlineCount}/{devices.length} screen{devices.length === 1 ? '' : 's'} online</span>
      </div>
      <p className="text-muted" style={{ margin: 0, fontSize: 13 }}>
        Quick controls for every screen — force or clear content, flash, blackout, and announcements, without digging through Home.
      </p>

      <div className="card" style={{ gap: 10 }}>
        <h2 style={{ margin: 0, fontSize: 14 }}>Every screen</h2>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6 }}>
          <button type="button" className="btn btn-warning" style={{ fontSize: 12, padding: '4px 10px' }} onClick={onOpenBlackoutAllScreens}>
            <Icon name="moon" size={13} /> Blackout all
          </button>
          <button type="button" className="btn btn-ghost" style={{ fontSize: 12, padding: '4px 8px' }} onClick={() => void blackoutAllScreens(false)}>
            Clear blackout
          </button>
          <button type="button" className="btn btn-secondary" style={{ fontSize: 12, padding: '4px 10px' }} onClick={onForceContentAllScreens}>
            <Icon name="monitor" size={13} /> Force content on all
          </button>
          <button type="button" className="btn btn-ghost" style={{ fontSize: 12, padding: '4px 8px' }} onClick={() => void forceContentAllScreens(null)}>
            Clear forced content
          </button>
          <button type="button" className="btn btn-secondary" style={{ fontSize: 12, padding: '4px 10px' }} onClick={onForceAnnouncementAllScreens}>
            <Icon name="messageCircle" size={13} /> Force announcement on all
          </button>
          <button type="button" className="btn btn-ghost" style={{ fontSize: 12, padding: '4px 8px' }} onClick={() => void forceAnnouncementAllScreens(null)}>
            Clear announcement
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            style={{ fontSize: 12, padding: '4px 10px' }}
            disabled={devices.length === 0}
            title="Briefly flash every screen white, one at a time finding a target isn't needed"
            onClick={() => void flashAllScreens()}
          >
            <Icon name="zap" size={13} /> Flash all screens
          </button>
        </div>
      </div>

      {isEmpty ? (
        <p className="text-muted" style={{ margin: 0 }}>No screens or groups yet — add one from Home first.</p>
      ) : (
        <>
          {groups.map(renderGroupRow)}
          {standaloneDevices.map(renderDeviceRow)}
        </>
      )}
    </div>
  );
}
