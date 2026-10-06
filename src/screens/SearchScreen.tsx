import { useState } from 'react';
import { Icon } from '../components/icons/Icon';
import type { AppState } from '../hooks/useAppState';
import type { Device } from '../api/types';
import { forcedPlaylistLabel } from '../api/resolve';

interface SearchScreenProps {
  app: AppState;
  onOpenDevicePreview: (device: Device) => void;
  /** A grouped screen's own forced content/blackout overrides its group's (same as DeviceCard on Home) — these apply regardless of groupId. */
  onForceContentForDevice: (deviceId: string) => void;
  onOpenBlackoutForDevice: (deviceId: string) => void;
  /** Switches to Home and scrolls to the given screen's card or group section — `device-<id>` or `group-<id>`, matching the DOM ids HomeScreen's own cards/group sections carry (see HomeScreen.tsx's scrollTarget prop). */
  onJumpToHome: (target: string) => void;
}

// Where a screen physically "lives," for display only — mirrors the same
// group-vs-standalone, Location-fills-in-for-a-standalone-screen logic used
// throughout Settings/Home, just resolved down to one label here since this
// screen has no section structure of its own to nest results under.
function locationLabel(device: Device, groups: AppState['groups'], locations: AppState['locations']): string {
  const locationsById = new Map(locations.map((l) => [l.id, l.name]));
  if (device.groupId) {
    const group = groups.find((g) => g.id === device.groupId);
    if (!group) return 'Unknown group';
    const loc = group.locationId ? locationsById.get(group.locationId) : undefined;
    return loc ? `${group.name} · ${loc}` : group.name;
  }
  const loc = device.locationId ? locationsById.get(device.locationId) : undefined;
  return loc ? `Standalone · ${loc}` : 'Standalone';
}

export function SearchScreen({ app, onOpenDevicePreview, onForceContentForDevice, onOpenBlackoutForDevice, onJumpToHome }: SearchScreenProps) {
  const { devices, groups, locations, library, flashDevice, restartDevice, setDeviceForcedPlaylist, setDeviceBlackout } = app;
  const [query, setQuery] = useState('');
  const libraryById = new Map(library.map((item) => [item.id, item]));

  const trimmed = query.trim().toLowerCase();
  // Name, IP, and MAC are the three fields someone's actually likely to have
  // written down or be staring at (a label on the Pi, a DHCP table, a network
  // scan) — matches this project's other IP-centric flows (Add a screen's
  // "Enter IP", Device inventory's export) rather than searching every field.
  const results = trimmed
    ? devices.filter((d) =>
        d.name.toLowerCase().includes(trimmed) ||
        d.ip.toLowerCase().includes(trimmed) ||
        (d.mac?.toLowerCase().includes(trimmed) ?? false),
      )
    : devices;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <h1 style={{ margin: 0 }}>Search</h1>

      <div className="card" style={{ gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Icon name="search" size={16} style={{ opacity: 0.6, flexShrink: 0 }} />
          <input
            className="input"
            style={{ flex: 1 }}
            placeholder="Search screens by name, IP, or MAC address"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoFocus
          />
        </div>
      </div>

      <div className="card" style={{ gap: 8 }}>
        {devices.length === 0 ? (
          <p className="text-muted" style={{ margin: 0, fontSize: 13 }}>No screens paired yet.</p>
        ) : results.length === 0 ? (
          <p className="text-muted" style={{ margin: 0, fontSize: 13 }}>No screens match "{query}".</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {results.map((device) => {
              const jumpTarget = device.groupId ? `group-${device.groupId}` : `device-${device.id}`;
              const forced = device.forcedPlaylist.length > 0;
              return (
                <div
                  key={device.id}
                  style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0', borderTop: '1px solid var(--color-divider)', flexWrap: 'wrap' }}
                >
                  <span className={`status-dot ${device.status}`} style={{ flexShrink: 0 }} />
                  {/* Clicking the name/location jumps to this screen's full card (standalone)
                      or its group's full management section (grouped) on Home — same target
                      as the explicit "Open" button below, just the larger, more obvious
                      click target for the common case of wanting the full view. */}
                  <button
                    type="button"
                    className="btn btn-ghost"
                    style={{ flex: '1 1 140px', minWidth: 0, justifyContent: 'flex-start', textAlign: 'left', padding: '2px 4px' }}
                    onClick={() => onJumpToHome(jumpTarget)}
                    title={device.groupId ? "Open this screen's group on Home" : 'Open this screen on Home'}
                  >
                    <span style={{ minWidth: 0, overflow: 'hidden' }}>
                      <span style={{ display: 'block', fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{device.name}</span>
                      <span className="text-muted" style={{ display: 'block', fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {locationLabel(device, groups, locations)}
                      </span>
                    </span>
                  </button>
                  <a
                    className="tag tag-neutral"
                    style={{ textDecoration: 'none', flexShrink: 0 }}
                    href={`http://${device.ip}:8088/network-setup.html`}
                    target="_blank"
                    rel="noreferrer"
                    title="Open this screen's own settings page (Wi-Fi, local content, performance)"
                  >
                    {device.ip}
                  </a>
                  {device.mac && <span className="tag tag-neutral" style={{ flexShrink: 0 }}>{device.mac}</span>}
                  <span className="tag tag-neutral" style={{ flexShrink: 0 }}>{device.status === 'online' ? 'Online' : 'Offline'}</span>
                  {/* A grouped screen's own forced content/blackout overrides its group's
                      (same as DeviceCard on Home) — shown for every screen, standalone or
                      grouped. "Open" below is still the fast path to the whole group's
                      own controls when that's what's wanted instead. */}
                  <div style={{ display: 'flex', gap: 2, flexShrink: 0 }}>
                    {device.blackout ? (
                      <button type="button" className="btn btn-ghost" style={{ fontSize: 11, padding: '4px 8px' }} onClick={() => setDeviceBlackout(device.id, false)} title="Stop blackout">
                        Blacked out · Stop
                      </button>
                    ) : (
                      <button type="button" className="btn btn-warning btn-icon" aria-label="Blackout" title="Blackout this screen" onClick={() => onOpenBlackoutForDevice(device.id)}>
                        <Icon name="moon" size={14} />
                      </button>
                    )}
                    {forced ? (
                      <button
                        type="button"
                        className="btn btn-ghost"
                        style={{ fontSize: 11, padding: '4px 8px' }}
                        onClick={() => setDeviceForcedPlaylist(device.id, [])}
                        title={`Stop forcing: ${forcedPlaylistLabel(device.forcedPlaylist, libraryById)}`}
                      >
                        Forced · Stop
                      </button>
                    ) : (
                      <button type="button" className="btn btn-secondary btn-icon" aria-label="Force content" title="Force content on this screen" onClick={() => onForceContentForDevice(device.id)}>
                        <Icon name="monitor" size={14} />
                      </button>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: 2, flexShrink: 0 }}>
                    <button type="button" className="btn btn-ghost btn-icon" aria-label="Identify" title="Blink this screen's display" onClick={() => void flashDevice(device)}>
                      <Icon name="lightbulb" size={14} />
                    </button>
                    <button type="button" className="btn btn-ghost btn-icon" aria-label="Preview" title="See what's currently on this screen" onClick={() => onOpenDevicePreview(device)}>
                      <Icon name="eye" size={14} />
                    </button>
                    <button type="button" className="btn btn-ghost btn-icon" aria-label="Restart" title="Reboot this screen" onClick={() => void restartDevice(device)}>
                      <Icon name="restart" size={14} />
                    </button>
                    <button type="button" className="btn btn-ghost btn-icon" aria-label="Open" title={device.groupId ? "Open this screen's group on Home" : 'Open this screen on Home'} onClick={() => onJumpToHome(jumpTarget)}>
                      <Icon name="chevronRight" size={14} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
