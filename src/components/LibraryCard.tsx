import { useState, type HTMLAttributes } from 'react';
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

// Announcements and clocks have no underlying file — nothing to download for
// those. Video downloads the original upload (fullUrl), not whichever capped/full
// copy a given screen happens to be playing, since "download the uploaded content"
// means the source file, not a resolution-specific derivative of it.
function downloadUrlFor(item: LibraryItem): string | undefined {
  if (item.type === 'video') return item.fullUrl ?? item.thumb;
  if (item.type === 'image' || item.type === 'pdf') return item.thumb;
  return undefined;
}

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
  onSetTags: (id: string, tags: string[]) => void;
  /** Spread onto a small grip icon rather than the whole card, so dragging doesn't fight with selecting the rename input's text or clicking the remove button. */
  dragHandleProps?: HTMLAttributes<HTMLSpanElement>;
  isDragging?: boolean;
  selectMode?: boolean;
  selected?: boolean;
  onToggleSelect?: (id: string) => void;
}

export function LibraryCard({ item, onRemove, onRename, onSetTags, dragHandleProps, isDragging, selectMode, selected, onToggleSelect }: LibraryCardProps) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(item.name);
  const [editingTags, setEditingTags] = useState(false);
  const [tagsInput, setTagsInput] = useState('');
  const downloadUrl = downloadUrlFor(item);

  const startEdit = () => {
    setName(item.name);
    setEditing(true);
  };
  const save = () => {
    if (name.trim()) onRename(item.id, name);
    setEditing(false);
  };
  const startEditTags = () => {
    setTagsInput(item.tags.join(', '));
    setEditingTags(true);
  };
  const saveTags = () => {
    onSetTags(item.id, tagsInput.split(',').map((t) => t.trim()).filter(Boolean));
    setEditingTags(false);
  };

  return (
    <div
      className="card"
      data-library-id={item.id}
      style={{ gap: 8, padding: 8, opacity: isDragging ? 0.4 : 1, outline: selected ? '2px solid var(--color-accent)' : 'none' }}
    >
      <div className="thumb-box">
        {selectMode && (
          <input
            type="checkbox"
            className="card-select-checkbox"
            aria-label={`Select ${item.name}`}
            checked={!!selected}
            onChange={() => onToggleSelect?.(item.id)}
          />
        )}
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
        {downloadUrl && (
          <a
            className="btn btn-ghost btn-icon thumb-download"
            aria-label="Download"
            title="Download the uploaded file"
            href={downloadUrl}
            download={item.name}
            target="_blank"
            rel="noreferrer"
          >
            <Icon name="download" size={12} />
          </a>
        )}
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
          <span
            {...dragHandleProps}
            aria-label="Drag to reorder"
            title="Drag to reorder"
            style={{ display: 'flex', flexShrink: 0, opacity: 0.4, cursor: 'grab', ...dragHandleProps?.style }}
          >
            <Icon name="gripVertical" size={12} />
          </span>
          <div style={{ flex: 1, minWidth: 0, fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {item.name}
          </div>
          <button type="button" className="btn btn-ghost btn-icon" aria-label="Rename" onClick={startEdit}>
            <Icon name="pencil" size={12} />
          </button>
        </div>
      )}
      <div className="text-muted" style={{ fontSize: 11, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{metaText(item)}</div>
      {editingTags ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <input
            className="input"
            style={{ flex: 1, fontSize: 11, padding: '3px 6px' }}
            value={tagsInput}
            placeholder="tag1, tag2"
            onChange={(e) => setTagsInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && saveTags()}
            autoFocus
          />
          <button type="button" className="btn btn-secondary btn-icon" style={{ width: 20, height: 20 }} aria-label="Save tags" onClick={saveTags}>
            <Icon name="check" size={11} />
          </button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 4 }}>
          {item.tags.map((t) => (
            <span key={t} className="tag tag-neutral" style={{ fontSize: 10 }}>{t}</span>
          ))}
          <button type="button" className="btn btn-ghost btn-icon" style={{ width: 20, height: 20 }} aria-label="Edit tags" onClick={startEditTags}>
            <Icon name="tag" size={11} />
          </button>
        </div>
      )}
    </div>
  );
}
