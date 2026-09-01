import { useState } from 'react';
import { Icon } from './icons/Icon';
import type { Device, LibraryItem } from '../api/types';

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
        {device.mac && <span className="tag tag-neutral">{device.mac}</span>}
        <span className="tag tag-neutral">{device.status === 'online' ? 'Online' : 'Offline'}</span>
      </div>
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
    </div>
  );
}
