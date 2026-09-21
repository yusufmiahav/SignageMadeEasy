import { useState, type PointerEvent as ReactPointerEvent } from 'react';
import { Icon } from './icons/Icon';
import { TYPE_ICON, TYPE_LABEL } from './libraryItemMeta';
import type { Folder, LibraryItem } from '../api/types';

interface RowHandlers {
  draggedId: string | null;
  dropFolderId: string | null;
  onDragStart: (id: string) => void;
  onPointerMove: (e: ReactPointerEvent) => void;
  onDragEnd: () => void;
  onRemoveItem: (id: string) => void;
  onRenameItem: (id: string, name: string) => void;
  onMoveItem: (item: LibraryItem) => void;
  onConfigureItem: (item: LibraryItem) => void;
  onPreviewItem: (item: LibraryItem) => void;
  onRenameFolder: (id: string, name: string) => void;
  onDeleteFolder: (id: string) => void;
  onMoveFolder: (folder: Folder) => void;
}

function childFoldersOf(folders: Folder[], parentId: string | null): Folder[] {
  return folders.filter((f) => (f.parentId ?? null) === parentId).sort((a, b) => a.name.localeCompare(b.name));
}

function childItemsOf(items: LibraryItem[], folderId: string | null): LibraryItem[] {
  return items.filter((i) => (i.folderId ?? null) === folderId);
}

function ItemRow({ item, depth, h }: { item: LibraryItem; depth: number; h: RowHandlers }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(item.name);
  const save = () => {
    if (name.trim()) h.onRenameItem(item.id, name);
    setEditing(false);
  };

  return (
    <div
      data-library-id={item.id}
      style={{
        display: 'flex', alignItems: 'center', gap: 8, paddingLeft: 4 + depth * 18, padding: '6px 4px',
        borderBottom: '1px solid var(--color-divider)', opacity: h.draggedId === item.id ? 0.4 : 1,
      }}
    >
      <span
        aria-label="Drag to move"
        title="Drag onto a folder to move it there"
        style={{ display: 'flex', flexShrink: 0, opacity: 0.4, cursor: 'grab', touchAction: 'none' }}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          h.onDragStart(item.id);
        }}
        onPointerMove={h.onPointerMove}
        onPointerUp={h.onDragEnd}
        onPointerCancel={h.onDragEnd}
      >
        <Icon name="gripVertical" size={12} />
      </span>
      <Icon name={TYPE_ICON[item.type]} size={14} style={{ flexShrink: 0, opacity: 0.6 }} />
      {editing ? (
        <>
          <input
            className="input"
            style={{ flex: 1, fontSize: 12, padding: '3px 6px' }}
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && save()}
            autoFocus
          />
          <button type="button" className="btn btn-ghost btn-icon" style={{ width: 20, height: 20 }} aria-label="Save name" onClick={save}>
            <Icon name="check" size={11} />
          </button>
        </>
      ) : (
        <>
          <span style={{ flex: 1, fontSize: 13, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.name}</span>
          <span className="tag tag-neutral" style={{ fontSize: 10 }}>{TYPE_LABEL[item.type]}</span>
          <button type="button" className="btn btn-ghost btn-icon" style={{ width: 20, height: 20 }} aria-label="Rename" onClick={() => setEditing(true)}>
            <Icon name="pencil" size={11} />
          </button>
          {(item.type === 'ndi' || item.type === 'tfl-status' || item.type === 'tfl-arrivals') && (
            <button type="button" className="btn btn-ghost btn-icon" style={{ width: 20, height: 20 }} aria-label="Edit options" onClick={() => h.onConfigureItem(item)}>
              <Icon name="sliders" size={11} />
            </button>
          )}
          <button type="button" className="btn btn-ghost btn-icon" style={{ width: 20, height: 20 }} aria-label="Move to folder" onClick={() => h.onMoveItem(item)}>
            <Icon name="move" size={11} />
          </button>
          <button type="button" className="btn btn-ghost btn-icon" style={{ width: 20, height: 20 }} aria-label="Preview" title="Preview" onClick={() => h.onPreviewItem(item)}>
            <Icon name="eye" size={11} />
          </button>
          <button type="button" className="btn btn-ghost btn-icon" style={{ width: 20, height: 20 }} aria-label="Remove" onClick={() => h.onRemoveItem(item.id)}>
            <Icon name="x" size={11} />
          </button>
        </>
      )}
    </div>
  );
}

// Expanded by default at the top level (so opening the tree view immediately shows
// something useful), collapsed below that — deep hierarchies don't dump every item
// into view at once. Doubles as a drop target for dragging an item (or another
// folder move, via the move button below) into it — data-folder-id is the same hook
// LibraryScreen.tsx's pointer-drag handling already looks for in the grid view.
function FolderRow({ folder, depth, folders, items, h }: { folder: Folder; depth: number; folders: Folder[]; items: LibraryItem[]; h: RowHandlers }) {
  const [expanded, setExpanded] = useState(depth === 0);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(folder.name);
  const childFolders = childFoldersOf(folders, folder.id);
  const childItems = childItemsOf(items, folder.id);
  const isEmpty = childFolders.length === 0 && childItems.length === 0;
  const isDropTarget = h.dropFolderId === folder.id;
  const save = () => {
    if (name.trim()) h.onRenameFolder(folder.id, name);
    setEditing(false);
  };

  return (
    <div>
      <div
        data-folder-id={folder.id}
        style={{
          display: 'flex', alignItems: 'center', gap: 6, paddingLeft: 4 + depth * 18, padding: '6px 4px',
          borderRadius: 6, background: isDropTarget ? 'var(--color-accent)' : undefined,
          color: isDropTarget ? 'var(--color-bg)' : undefined,
        }}
      >
        <button
          type="button"
          className="btn btn-ghost btn-icon"
          style={{ width: 20, height: 20 }}
          aria-label={expanded ? 'Collapse' : 'Expand'}
          onClick={() => setExpanded((e) => !e)}
          disabled={isEmpty}
        >
          <Icon name={expanded ? 'chevronDown' : 'chevronRight'} size={12} style={{ opacity: isEmpty ? 0.25 : 0.7 }} />
        </button>
        <Icon name="folder" size={14} style={{ flexShrink: 0, opacity: 0.8 }} />
        {editing ? (
          <>
            <input
              className="input"
              style={{ flex: 1, fontSize: 12, padding: '3px 6px' }}
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && save()}
              autoFocus
            />
            <button type="button" className="btn btn-ghost btn-icon" style={{ width: 20, height: 20 }} aria-label="Save name" onClick={save}>
              <Icon name="check" size={11} />
            </button>
          </>
        ) : (
          <>
            <span style={{ flex: 1, fontSize: 13, fontWeight: 600 }}>{folder.name}</span>
            <span style={{ fontSize: 11, opacity: 0.7 }}>{childItems.length} item{childItems.length === 1 ? '' : 's'}</span>
            <button type="button" className="btn btn-ghost btn-icon" style={{ width: 20, height: 20 }} aria-label="Rename folder" onClick={() => setEditing(true)}>
              <Icon name="pencil" size={11} />
            </button>
            <button type="button" className="btn btn-ghost btn-icon" style={{ width: 20, height: 20 }} aria-label={`Move ${folder.name}`} onClick={() => h.onMoveFolder(folder)}>
              <Icon name="move" size={11} />
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-icon"
              style={{ width: 20, height: 20 }}
              aria-label={`Delete ${folder.name}`}
              title="Delete folder — contents move up a level, nothing inside is deleted"
              onClick={() => h.onDeleteFolder(folder.id)}
            >
              <Icon name="x" size={11} />
            </button>
          </>
        )}
      </div>
      {expanded && (
        <div>
          {childFolders.map((f) => (
            <FolderRow key={f.id} folder={f} depth={depth + 1} folders={folders} items={items} h={h} />
          ))}
          {childItems.map((item) => (
            <ItemRow key={item.id} item={item} depth={depth + 1} h={h} />
          ))}
        </div>
      )}
    </div>
  );
}

interface LibraryTreeViewProps extends RowHandlers {
  folders: Folder[];
  /** Already filtered by search/type/tag — NOT scoped to a folder, since this view shows the whole hierarchy at once rather than one level at a time. */
  items: LibraryItem[];
}

/**
 * The Library screen's alternate "quick" view — the whole folder hierarchy as one
 * expandable outline (like a file-tree browser) instead of navigating in and out of
 * folders one at a time. Built for fast reorganizing: every folder is a live drop
 * target for dragging an item onto, and every row carries the same move/rename/
 * delete actions the grid view's cards have, just inline instead of on a tile.
 */
export function LibraryTreeView({ folders, items, ...handlers }: LibraryTreeViewProps) {
  const rootFolders = childFoldersOf(folders, null);
  const rootItems = childItemsOf(items, null);

  if (rootFolders.length === 0 && rootItems.length === 0) {
    return <p className="text-muted" style={{ margin: 0 }}>No content matches your search/filters.</p>;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      {rootFolders.map((folder) => (
        <FolderRow key={folder.id} folder={folder} depth={0} folders={folders} items={items} h={handlers} />
      ))}
      {rootItems.map((item) => (
        <ItemRow key={item.id} item={item} depth={0} h={handlers} />
      ))}
    </div>
  );
}
