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
}

export function LibraryCard({ item, onRemove }: LibraryCardProps) {
  return (
    <div className="card" style={{ gap: 8, padding: 8 }}>
      <div className="thumb-box">
        {item.type === 'image' && item.thumb ? (
          <div className="thumb-img" style={{ backgroundImage: `url(${item.thumb})` }} />
        ) : (
          <Icon name={TYPE_ICON[item.type]} size={24} style={{ opacity: 0.4 }} />
        )}
        <span className="tag tag-accent type-tag">{TYPE_LABEL[item.type]}</span>
        <button type="button" className="btn btn-ghost btn-icon thumb-remove" aria-label="Remove" onClick={() => onRemove(item.id)}>
          <Icon name="x" size={12} />
        </button>
      </div>
      <div style={{ fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.name}</div>
      <div className="text-muted" style={{ fontSize: 11, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{metaText(item)}</div>
    </div>
  );
}
