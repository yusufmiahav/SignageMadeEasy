import { useState } from 'react';
import { Icon } from './icons/Icon';
import type { Device, LibraryItem } from '../api/types';

interface DeviceCardProps {
  device: Device;
  nowPlaying: string;
  announcement: LibraryItem | undefined;
  onRename: (id: string, name: string) => void;
  onRestart: (device: Device) => void;
  onMove: (device: Device) => void;
  onRemove: (id: string) => void;
  onPickAnnouncement: (device: Device) => void;
  onToggleAnnouncement: (id: string) => void;
}

export function DeviceCard({
  device,
  nowPlaying,
  announcement,
  onRename,
  onRestart,
  onMove,
  onRemove,
  onPickAnnouncement,
  onToggleAnnouncement,
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
      <div className="preview-box">
        <span className="tag tag-outline dims-tag">1920×1080</span>
        <span className="preview-box-label">{nowPlaying}</span>
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
        <span className="tag tag-neutral">{device.ip}</span>
        <span className="tag tag-neutral">{device.status === 'online' ? 'Online' : 'Offline'}</span>
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
