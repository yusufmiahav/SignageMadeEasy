import { Icon } from './icons/Icon';
import type { LibraryItem } from '../api/types';

function playlistMeta(item: LibraryItem): string {
  switch (item.type) {
    case 'image':
    case 'clock':
      return '';
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
  onSetDuration?: (durationSec: number) => void;
}

export function PlaylistRow({ item, order, upDisabled, downDisabled, onMoveUp, onMoveDown, onRemove, onSetDuration }: PlaylistRowProps) {
  return (
    <div className="card" style={{ flexDirection: 'row', alignItems: 'center', gap: 8, padding: '8px 10px' }}>
      <div className="text-muted" style={{ width: 16, textAlign: 'center', fontSize: 12 }}>{order}.</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.name}</div>
        {item.type === 'image' || item.type === 'clock' ? (
          <div className="text-muted" style={{ fontSize: 11, display: 'flex', alignItems: 'center', gap: 4 }}>
            Plays for
            <input
              key={item.durationSec ?? 8}
              type="number"
              className="input"
              min={1}
              defaultValue={item.durationSec ?? 8}
              onBlur={(e) => {
                const n = Math.round(Number(e.target.value));
                if (Number.isFinite(n) && n > 0) onSetDuration?.(n);
                else e.target.value = String(item.durationSec ?? 8);
              }}
              onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
              style={{ width: 40, padding: '1px 4px', fontSize: 11, height: 18, lineHeight: 1 }}
              aria-label={`Seconds ${item.name} plays for`}
            />
            s
          </div>
        ) : (
          <div className="text-muted" style={{ fontSize: 11 }}>{playlistMeta(item)}</div>
        )}
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
