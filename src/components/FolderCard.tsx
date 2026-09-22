import { useState } from 'react';
import { Icon } from './icons/Icon';
import type { Folder } from '../api/types';

interface FolderCardProps {
  folder: Folder;
  /** Items filed directly inside this folder — not recursive into subfolders, which show as their own tiles instead. */
  itemCount: number;
  onOpen: (id: string) => void;
  onRename: (id: string, name: string) => void;
  onDelete: (id: string) => void;
  onMove: (folder: Folder) => void;
  /** True while a dragged library item is currently hovering this tile — see LibraryScreen.tsx's pointer-drag handling. */
  isDropTarget?: boolean;
  selectMode?: boolean;
  selected?: boolean;
  onToggleSelect?: (id: string) => void;
}

// Same card shell/thumb-box treatment as LibraryCard, so folders and content sit
// together in one visually consistent grid rather than looking like a bolted-on
// second UI. data-folder-id is the drop-target hook the Library screen's existing
// pointer-based drag system checks for (see its handlePointerMove).
export function FolderCard({ folder, itemCount, onOpen, onRename, onDelete, onMove, isDropTarget, selectMode, selected, onToggleSelect }: FolderCardProps) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(folder.name);

  const startEdit = () => {
    setName(folder.name);
    setEditing(true);
  };
  const save = () => {
    if (name.trim()) onRename(folder.id, name);
    setEditing(false);
  };

  return (
    <div
      className="card"
      data-folder-id={folder.id}
      style={{ gap: 8, padding: 8, outline: isDropTarget || selected ? '2px solid var(--color-accent)' : 'none' }}
    >
      <div className="thumb-box" style={{ cursor: 'pointer' }} onClick={() => onOpen(folder.id)}>
        {selectMode && (
          <input
            type="checkbox"
            className="card-select-checkbox"
            aria-label={`Select ${folder.name}`}
            checked={!!selected}
            onClick={(e) => e.stopPropagation()}
            onChange={() => onToggleSelect?.(folder.id)}
          />
        )}
        <div
          style={{
            width: '100%', height: '100%', background: 'var(--color-neutral-900)', color: '#fff',
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8,
          }}
        >
          <Icon name="folder" size={28} />
          <span style={{ fontSize: 11, fontWeight: 600, opacity: 0.8 }}>{itemCount} item{itemCount === 1 ? '' : 's'}</span>
        </div>
        <button
          type="button"
          className="btn btn-ghost btn-icon thumb-remove"
          aria-label={`Delete ${folder.name}`}
          title="Delete folder — contents move up a level, nothing inside is deleted"
          onClick={(e) => { e.stopPropagation(); onDelete(folder.id); }}
        >
          <Icon name="x" size={12} />
        </button>
        <button
          type="button"
          className="btn btn-ghost btn-icon thumb-configure"
          aria-label={`Move ${folder.name}`}
          title="Move to another folder"
          onClick={(e) => { e.stopPropagation(); onMove(folder); }}
        >
          <Icon name="move" size={12} />
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
          <div
            style={{ flex: 1, minWidth: 0, fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', cursor: 'pointer' }}
            onClick={() => onOpen(folder.id)}
          >
            {folder.name}
          </div>
          <button type="button" className="btn btn-ghost btn-icon" aria-label="Rename folder" onClick={startEdit}>
            <Icon name="pencil" size={12} />
          </button>
        </div>
      )}
    </div>
  );
}
