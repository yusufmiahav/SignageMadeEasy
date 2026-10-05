import { useState } from 'react';
import { Icon } from '../components/icons/Icon';
import type { AppState } from '../hooks/useAppState';
import type { Device } from '../api/types';

interface SearchScreenProps {
  app: AppState;
  onOpenDevicePreview: (device: Device) => void;
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

export function SearchScreen({ app, onOpenDevicePreview }: SearchScreenProps) {
  const { devices, groups, locations, flashDevice, restartDevice } = app;
  const [query, setQuery] = useState('');

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
            {results.map((device) => (
              <div
                key={device.id}
                style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0', borderTop: '1px solid var(--color-divider)', flexWrap: 'wrap' }}
              >
                <span className={`status-dot ${device.status}`} style={{ flexShrink: 0 }} />
                {/* A fixed flex-basis (rather than plain flex: 1) so a narrow row wraps
                    this whole name block onto its own line instead of squeezing it thin
                    enough to truncate — same pattern as Settings' own device rows. */}
                <div style={{ flex: '1 1 140px', minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{device.name}</div>
                  <div className="text-muted" style={{ fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {locationLabel(device, groups, locations)}
                  </div>
                </div>
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
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
