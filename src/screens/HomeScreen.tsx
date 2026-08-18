import { Icon } from '../components/icons/Icon';
import { DeviceCard } from '../components/DeviceCard';
import type { AppState } from '../hooks/useAppState';
import { activeContentIds, nowPlayingName } from '../api/resolve';
import type { Device, Group } from '../api/types';

interface HomeScreenProps {
  app: AppState;
  onAddScreen: () => void;
  onForceContent: (group: Group) => void;
  onMoveDevice: (device: Device) => void;
  onPickAnnouncement: (device: Device) => void;
}

export function HomeScreen({ app, onAddScreen, onForceContent, onMoveDevice, onPickAnnouncement }: HomeScreenProps) {
  const { groups, devices, library, renameDevice, restartDevice, removeDevice, toggleDeviceAnnouncement, setForcedContent } = app;
  const libraryById = new Map(library.map((item) => [item.id, item]));
  const groupsWithDevices = groups
    .map((group) => ({ group, devices: devices.filter((d) => d.groupId === group.id) }))
    .filter((g) => g.devices.length > 0);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h1 style={{ margin: 0 }}>Screens</h1>
        <button type="button" className="btn btn-primary btn-icon mobile-only" aria-label="Add a screen" onClick={onAddScreen}>
          <Icon name="plus" size={16} />
        </button>
        <button type="button" className="btn btn-primary desktop-only" onClick={onAddScreen}>Add a screen</button>
      </div>

      {groupsWithDevices.length === 0 ? (
        <div className="empty-state">
          <Icon name="monitor" size={30} />
          <p className="text-muted" style={{ margin: 0 }}>No screens paired yet.</p>
          <button type="button" className="btn btn-primary" onClick={onAddScreen}>Add a screen</button>
        </div>
      ) : (
        groupsWithDevices.map(({ group, devices: groupDevices }) => {
          const active = activeContentIds(group);
          const forcedItem = group.forcedContentId ? libraryById.get(group.forcedContentId) : undefined;
          return (
            <div key={group.id} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <h2 style={{ margin: 0, fontSize: 15 }}>{group.name}</h2>
                  <span className="tag tag-neutral">{groupDevices.length} screen{groupDevices.length === 1 ? '' : 's'}</span>
                </div>
                {active.kind === 'forced' ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span className="tag tag-accent">Forced: {forcedItem?.name ?? '—'}</span>
                    <button type="button" className="btn btn-ghost" style={{ fontSize: 12, padding: '4px 8px' }} onClick={() => setForcedContent(group.id, null)}>
                      Stop
                    </button>
                  </div>
                ) : (
                  <button type="button" className="btn btn-secondary" style={{ fontSize: 12, padding: '4px 10px' }} onClick={() => onForceContent(group)}>
                    Force content
                  </button>
                )}
              </div>
              <hr className="hr" style={{ margin: 0 }} />
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
                  />
                ))}
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}
