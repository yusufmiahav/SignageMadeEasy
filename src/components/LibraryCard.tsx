import { useState, type HTMLAttributes } from 'react';
import { Icon } from './icons/Icon';
import { TYPE_ICON, TYPE_LABEL, metaText, downloadUrlFor } from './libraryItemMeta';
import type { LibraryItem } from '../api/types';

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
  /** 'ndi'/'tfl-status'/'tfl-arrivals' only — reopens the add dialog in edit mode to change the source name/modes/lines without deleting and re-adding the item. Omitted (button hidden) for every other type. */
  onConfigure?: (item: LibraryItem) => void;
  /** Every item type — opens the folder picker to file this item elsewhere (or back to the library root). Omitted (button hidden) when there are no folders yet, same as onConfigure's own pattern. */
  onMove?: (item: LibraryItem) => void;
  /** Every item type — opens ContentPreviewDialog for a quick look without needing a paired screen. */
  onPreview?: (item: LibraryItem) => void;
}

export function LibraryCard({ item, onRemove, onRename, onSetTags, dragHandleProps, isDragging, selectMode, selected, onToggleSelect, onConfigure, onMove, onPreview }: LibraryCardProps) {
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
        ) : item.type === 'clock' || item.type === 'ndi' || item.type === 'tfl-status' || item.type === 'tfl-arrivals' || item.type === 'video' ? (
          // clock/ndi/tfl-status/tfl-arrivals have no underlying file at all —
          // live-rendered, streamed, or polled at playback time, so there's no
          // real image to thumbnail. Video does have a file, but `thumb` there
          // points at a video URL, not an image one — a CSS background-image
          // can't render a video frame from it (nothing this project does today
          // extracts an actual poster frame), so it's grouped with the others
          // here rather than pretending the tiny `Icon` fallback below is doing
          // it. Same full-bleed tile as announcement above either way — reads
          // as deliberate content rather than a missing/blank thumbnail, which a
          // small icon floating on the plain thumb-box background did not.
          <div
            style={{
              width: '100%', height: '100%', background: 'var(--color-neutral-900)', color: '#fff',
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '10px 12px',
            }}
          >
            <Icon name={TYPE_ICON[item.type]} size={28} />
            {metaText(item) && (
              <span
                style={{
                  fontSize: 11, fontWeight: 600, textAlign: 'center', opacity: 0.8, overflow: 'hidden',
                  display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
                }}
              >
                {metaText(item)}
              </span>
            )}
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
        {onPreview && (
          <button type="button" className="btn btn-ghost btn-icon thumb-preview" aria-label="Preview" title="Preview" onClick={() => onPreview(item)}>
            <Icon name="eye" size={12} />
          </button>
        )}
        {(item.type === 'ndi' || item.type === 'tfl-status' || item.type === 'tfl-arrivals') && onConfigure && (
          <button type="button" className="btn btn-ghost btn-icon thumb-configure" aria-label="Edit options" title="Change the source/lines/modes this shows" onClick={() => onConfigure(item)}>
            <Icon name="sliders" size={12} />
          </button>
        )}
        {onMove && (
          <button type="button" className="btn btn-ghost btn-icon thumb-move" aria-label="Move to folder" title="Move to another folder" onClick={() => onMove(item)}>
            <Icon name="move" size={12} />
          </button>
        )}
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
