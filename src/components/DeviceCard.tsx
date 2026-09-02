import { useState } from 'react';
import { Icon } from './icons/Icon';
import type { Device, LibraryItem } from '../api/types';

// Bits 0-3 of vcgencmd's get_throttled bitmask are current-state (under-voltage,
// arm-freq-capped, throttled, soft-temp-limit); bits 16-19 are "has happened since
// boot" versions of the same. Only the current-state bits are actionable right now —
// something that happened once at boot and hasn't recurred isn't worth a persistent
// warning badge.
function isCurrentlyThrottled(throttled: string | null | undefined): boolean {
  if (!throttled) return false;
  return (Number.parseInt(throttled, 16) & 0xf) !== 0;
}

function formatUptime(sec: number): string {
  const days = Math.floor(sec / 86400);
  const hours = Math.floor((sec % 86400) / 3600);
  const mins = Math.floor((sec % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}

interface DeviceCardProps {
  device: Device;
  nowPlaying: string;
  nowPlayingItem: LibraryItem | undefined;
  announcement: LibraryItem | undefined;
  onRename: (id: string, name: string) => void;
  onRestart: (device: Device) => void;
  onMove: (device: Device) => void;
  onRemove: (id: string) => void;
  onPickAnnouncement: (device: Device) => void;
  onToggleAnnouncement: (id: string) => void;
  onSetVideoQuality: (id: string, videoQuality: 'auto' | 'full') => void;
  onPreview: (item: LibraryItem) => void;
  /** Off by default (see Settings → Device cards) — shows just IP + online/offline until turned on. */
  advancedInfo: boolean;
  hideAnnouncementRow: boolean;
  /**
   * A screen with no location has no location header to host force-content/
   * announcement/blackout buttons, so this card shows its own — only rendered
   * while device.groupId is null. forcedContentName resolves device.forcedContentId
   * to a name (the card itself has no library to look it up in).
   */
  forcedContentName?: string;
  onForceContent: (deviceId: string) => void;
  onForceAnnouncement: (deviceId: string) => void;
  onOpenBlackout: (deviceId: string) => void;
  onStopForcedContent: (deviceId: string) => void;
  onStopBlackout: (deviceId: string) => void;
}

export function DeviceCard({
  device,
  nowPlaying,
  nowPlayingItem,
  announcement,
  onRename,
  onRestart,
  onMove,
  onRemove,
  onPickAnnouncement,
  onToggleAnnouncement,
  onSetVideoQuality,
  onPreview,
  advancedInfo,
  hideAnnouncementRow,
  forcedContentName,
  onForceContent,
  onForceAnnouncement,
  onOpenBlackout,
  onStopForcedContent,
  onStopBlackout,
}: DeviceCardProps) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(device.name);

  const startEdit = () => {
    setName(device.name);
    setEditing(true);
  };
  const save = () => {
    onRename(device.id, name);
    setEditing(false);
  };

  return (
    <div className="card">
      {!device.groupId && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
          {device.blackout ? (
            <>
              <span className="tag tag-warning">Blacked out</span>
              <button type="button" className="btn btn-ghost" style={{ fontSize: 11, padding: '2px 6px' }} onClick={() => onStopBlackout(device.id)}>Stop</button>
            </>
          ) : (
            <button type="button" className="btn btn-warning btn-icon" style={{ width: 26, height: 26 }} aria-label="Blackout" title="Blackout" onClick={() => onOpenBlackout(device.id)}>
              <Icon name="moon" size={13} />
            </button>
          )}
          {device.forcedContentId ? (
            <>
              <span className="tag tag-accent">Forced: {forcedContentName ?? '—'}</span>
              <button type="button" className="btn btn-ghost" style={{ fontSize: 11, padding: '2px 6px' }} onClick={() => onStopForcedContent(device.id)}>Stop</button>
            </>
          ) : (
            <button type="button" className="btn btn-secondary btn-icon" style={{ width: 26, height: 26 }} aria-label="Force content" title="Force content" onClick={() => onForceContent(device.id)}>
              <Icon name="monitor" size={13} />
            </button>
          )}
          <button type="button" className="btn btn-secondary btn-icon" style={{ width: 26, height: 26 }} aria-label="Force announcement" title="Force announcement" onClick={() => onForceAnnouncement(device.id)}>
            <Icon name="messageCircle" size={13} />
          </button>
        </div>
      )}
      <div
        className="preview-box"
        style={
          nowPlayingItem?.type === 'image' && nowPlayingItem.thumb
            ? { backgroundImage: `url(${nowPlayingItem.thumb})`, backgroundSize: 'cover', backgroundPosition: 'center' }
            : undefined
        }
      >
        <span className="tag tag-outline dims-tag">1920×1080</span>
        {!(nowPlayingItem?.type === 'image' && nowPlayingItem.thumb) && (
          <span className="preview-box-label">{nowPlaying}</span>
        )}
        {nowPlayingItem && (
          <button
            type="button"
            className="btn btn-ghost btn-icon thumb-remove"
            aria-label="Preview content"
            title="Preview what's currently showing"
            onClick={() => onPreview(nowPlayingItem)}
          >
            <Icon name="eye" size={13} />
          </button>
        )}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span className={`status-dot ${device.status}`} style={{ marginTop: editing ? 0 : 3, alignSelf: 'flex-start' }} />
        {editing ? (
          <>
            <input
              className="input"
              style={{ flex: 1 }}
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && save()}
              autoFocus
            />
            <button type="button" className="btn btn-secondary btn-icon" aria-label="Save" onClick={save}>
              <Icon name="check" size={14} />
            </button>
          </>
        ) : (
          <span className="card-title" style={{ flex: 1, minWidth: 0 }}>{device.name}</span>
        )}
      </div>
      {!editing && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 2 }}>
          <button type="button" className="btn btn-ghost btn-icon" aria-label="Restart" onClick={() => onRestart(device)}>
            <Icon name="restart" size={14} />
          </button>
          <button type="button" className="btn btn-ghost btn-icon" aria-label="Rename" onClick={startEdit}>
            <Icon name="pencil" size={14} />
          </button>
          <button type="button" className="btn btn-ghost btn-icon" aria-label="Move to another location" onClick={() => onMove(device)}>
            <Icon name="mapPin" size={14} />
          </button>
          <button type="button" className="btn btn-ghost btn-icon" aria-label="Remove" onClick={() => onRemove(device.id)}>
            <Icon name="trash" size={14} />
          </button>
        </div>
      )}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        <a
          className="tag tag-neutral"
          style={{ textDecoration: 'none' }}
          href={`http://${device.ip}:8088/network-setup.html`}
          target="_blank"
          rel="noreferrer"
          title="Open this screen's own settings page (Wi-Fi, local content, performance)"
        >
          {device.ip}
        </a>
        {advancedInfo && device.mac && <span className="tag tag-neutral">{device.mac}</span>}
        <span className="tag tag-neutral">{device.status === 'online' ? 'Online' : 'Offline'}</span>
      </div>
      {advancedInfo && (device.tempC != null || device.uptimeSec != null || device.diskFreeMb != null) && (
        <div className="text-muted" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', fontSize: 11 }}>
          {device.tempC != null && (
            <span style={isCurrentlyThrottled(device.throttled) ? { color: 'var(--color-danger, #c0392b)', fontWeight: 600 } : undefined}>
              {device.tempC.toFixed(0)}°C{isCurrentlyThrottled(device.throttled) ? ' · Throttling' : ''}
            </span>
          )}
          {device.uptimeSec != null && <span>Up {formatUptime(device.uptimeSec)}</span>}
          {device.diskFreeMb != null && device.diskTotalMb != null && (
            <span>{(device.diskFreeMb / 1024).toFixed(1)} / {(device.diskTotalMb / 1024).toFixed(1)} GB free</span>
          )}
        </div>
      )}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <Icon name="video" size={12} style={{ opacity: 0.6, flexShrink: 0 }} />
        <select
          className="input"
          style={{ flex: 1, fontSize: 11, padding: '3px 6px' }}
          value={device.videoQuality}
          onChange={(e) => onSetVideoQuality(device.id, e.target.value as 'auto' | 'full')}
          title="Which copy of a video this screen plays — full resolution needs more capable player hardware"
        >
          <option value="auto">Optimized video (recommended)</option>
          <option value="full">Full-resolution video</option>
        </select>
      </div>
      {!hideAnnouncementRow && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingTop: 2, borderTop: '1px solid var(--color-divider)' }}>
          <button
            type="button"
            className="btn btn-ghost"
            style={{ fontSize: 11, padding: '4px 0', flex: 1, justifyContent: 'flex-start', gap: 6 }}
            onClick={() => onPickAnnouncement(device)}
          >
            <Icon name="messageCircle" size={13} />
            {announcement ? announcement.name : 'Announcement: none'}
          </button>
          <label className="toggle">
            <input
              type="checkbox"
              checked={device.announcementOn}
              disabled={!device.announcementId}
              onChange={() => onToggleAnnouncement(device.id)}
            />
            <span className="toggle-track">
              <span className="toggle-dot" />
            </span>
          </label>
        </div>
      )}
    </div>
  );
}
