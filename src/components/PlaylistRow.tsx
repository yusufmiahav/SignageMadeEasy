import { Icon } from './icons/Icon';
import type { LibraryItem } from '../api/types';

function playlistMeta(item: LibraryItem): string {
  switch (item.type) {
    case 'image':
      return '8s';
    case 'video':
      return item.duration ?? '';
    case 'pdf':
      return 'PDF';
    case 'announcement':
      return 'Announcement';
  }
}

interface PlaylistRowProps {
  item: LibraryItem;
  order: number;
  upDisabled: boolean;
  downDisabled: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onRemove: () => void;
}

export function PlaylistRow({ item, order, upDisabled, downDisabled, onMoveUp, onMoveDown, onRemove }: PlaylistRowProps) {
  return (
    <div className="card" style={{ flexDirection: 'row', alignItems: 'center', gap: 8, padding: '8px 10px' }}>
      <div className="text-muted" style={{ width: 16, textAlign: 'center', fontSize: 12 }}>{order}.</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.name}</div>
        <div className="text-muted" style={{ fontSize: 11 }}>{playlistMeta(item)}</div>
      </div>
      <button type="button" className="btn btn-ghost btn-icon" aria-label="Move up" disabled={upDisabled} onClick={onMoveUp}>
        <Icon name="chevronUp" size={13} />
      </button>
      <button type="button" className="btn btn-ghost btn-icon" aria-label="Move down" disabled={downDisabled} onClick={onMoveDown}>
        <Icon name="chevronDown" size={13} />
      </button>
      <button type="button" className="btn btn-ghost btn-icon" aria-label="Remove" onClick={onRemove}>
        <Icon name="trash" size={13} />
      </button>
    </div>
  );
}
