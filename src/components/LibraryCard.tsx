import { useState } from 'react';
import { Icon, type IconName } from './icons/Icon';
import type { LibraryItem } from '../api/types';

const TYPE_ICON: Record<LibraryItem['type'], IconName> = {
  image: 'image',
  video: 'video',
  pdf: 'fileText',
  announcement: 'messageCircle',
  clock: 'clock',
};

const TYPE_LABEL: Record<LibraryItem['type'], string> = {
  image: 'Image',
  video: 'Video',
  pdf: 'PDF',
  announcement: 'Announcement',
  clock: 'Clock',
};

function metaText(item: LibraryItem): string {
  switch (item.type) {
    case 'image':
      return item.size ?? '';
    case 'video':
      return [item.duration, item.size].filter(Boolean).join(' · ');
    case 'pdf':
      return item.size ?? '';
    case 'announcement':
      return item.text ?? '';
    case 'clock':
      return 'Live time of day';
  }
}

interface LibraryCardProps {
  item: LibraryItem;
  onRemove: (id: string) => void;
  onRename: (id: string, name: string) => void;
}

export function LibraryCard({ item, onRemove, onRename }: LibraryCardProps) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(item.name);

  const startEdit = () => {
    setName(item.name);
    setEditing(true);
  };
  const save = () => {
    if (name.trim()) onRename(item.id, name);
    setEditing(false);
  };

  return (
    <div className="card" style={{ gap: 8, padding: 8 }}>
      <div className="thumb-box">
        {item.type === 'image' && item.thumb ? (
          <div className="thumb-img" style={{ backgroundImage: `url(${item.thumb})` }} />
        ) : item.type === 'announcement' ? (
          <div
            style={{
              width: '100%', height: '100%', background: '#000', color: '#fff',
              display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '10px 12px',
            }}
          >
            <span
              style={{
                fontSize: 12, fontWeight: 600, textAlign: 'center', overflow: 'hidden',
                display: '-webkit-box', WebkitLineClamp: 4, WebkitBoxOrient: 'vertical',
              }}
            >
              {item.text || 'Announcement'}
            </span>
          </div>
        ) : (
          <Icon name={TYPE_ICON[item.type]} size={24} style={{ opacity: 0.4 }} />
        )}
        <span className="tag tag-accent type-tag">{TYPE_LABEL[item.type]}</span>
        {item.transcodeStatus === 'processing' && (
          <span className="tag tag-neutral" style={{ position: 'absolute', bottom: 4, left: 4 }} title="The hub is creating a resolution-capped copy of this video in the background">
            Decoding…
          </span>
        )}
        {item.transcodeStatus === 'failed' && (
          <span className="tag tag-neutral" style={{ position: 'absolute', bottom: 4, left: 4 }} title="Capping this video failed — screens set to 'Optimized video' will play the full-resolution original instead">
            Full-res only
          </span>
        )}
        <button type="button" className="btn btn-ghost btn-icon thumb-remove" aria-label="Remove" onClick={() => onRemove(item.id)}>
          <Icon name="x" size={12} />
        </button>
      </div>
      {editing ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <input
            className="input"
            style={{ flex: 1, fontSize: 12, padding: '4px 6px' }}
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && save()}
            autoFocus
          />
          <button type="button" className="btn btn-secondary btn-icon" aria-label="Save name" onClick={save}>
            <Icon name="check" size={12} />
          </button>
        </div>
      ) : (
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <div style={{ flex: 1, minWidth: 0, fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {item.name}
          </div>
          <button type="button" className="btn btn-ghost btn-icon" aria-label="Rename" onClick={startEdit}>
            <Icon name="pencil" size={12} />
          </button>
        </div>
      )}
      <div className="text-muted" style={{ fontSize: 11, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{metaText(item)}</div>
    </div>
  );
}
