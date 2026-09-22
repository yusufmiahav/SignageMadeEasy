import { useState } from 'react';
import { Icon } from './icons/Icon';
import { FolderCard } from './FolderCard';
import { LibraryCard } from './LibraryCard';
import { FolderFlowDiagram } from './FolderFlowDiagram';
import type { Folder, LibraryItem } from '../api/types';

interface FolderInspectorPanelProps {
  folder: Folder;
  folders: Folder[];
  /** Full, unfiltered library — this panel scopes it to the opened folder's own direct children itself. */
  items: LibraryItem[];
  onClose: () => void;
  onOpenFolder: (id: string) => void;
  onOpenItem: (item: LibraryItem) => void;
  onRenameFolder: (id: string, name: string) => void;
  onDeleteFolder: (id: string) => void;
  onMoveFolder: (folder: Folder) => void;
  onRemoveItem: (id: string) => void;
  onRenameItem: (id: string, name: string) => void;
  onSetItemTags: (id: string, tags: string[]) => void;
  onConfigureItem: (item: LibraryItem) => void;
  onMoveItem: (item: LibraryItem) => void;
}

function countRecursive(folderId: string, folders: Folder[], items: LibraryItem[]): { folderCount: number; itemCount: number } {
  const childFolders = folders.filter((f) => (f.parentId ?? null) === folderId);
  let folderCount = childFolders.length;
  let itemCount = items.filter((i) => (i.folderId ?? null) === folderId).length;
  for (const child of childFolders) {
    const nested = countRecursive(child.id, folders, items);
    folderCount += nested.folderCount;
    itemCount += nested.itemCount;
  }
  return { folderCount, itemCount };
}

/**
 * Inline split panel shown above LibraryTreeView when a folder's NAME is clicked
 * (see LibraryScreen.tsx's `opened` state) — left pane is a grid-view-equivalent
 * of the folder's direct children with the same actions those tiles already have;
 * right pane is metadata plus a flow-chart diagram of the whole nested structure.
 */
export function FolderInspectorPanel({
  folder, folders, items, onClose, onOpenFolder, onOpenItem, onRenameFolder, onDeleteFolder, onMoveFolder,
  onRemoveItem, onRenameItem, onSetItemTags, onConfigureItem, onMoveItem,
}: FolderInspectorPanelProps) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(folder.name);

  const breadcrumb: Folder[] = [];
  for (let cursor = folders.find((f) => f.id === folder.parentId); cursor; cursor = folders.find((f) => f.id === cursor?.parentId)) {
    breadcrumb.unshift(cursor);
  }
  const childFolders = folders.filter((f) => (f.parentId ?? null) === folder.id).sort((a, b) => a.name.localeCompare(b.name));
  const childItems = items.filter((i) => (i.folderId ?? null) === folder.id);
  const { folderCount, itemCount } = countRecursive(folder.id, folders, items);

  const startEdit = () => {
    setName(folder.name);
    setEditing(true);
  };
  const save = () => {
    if (name.trim()) onRenameFolder(folder.id, name);
    setEditing(false);
  };

  return (
    <div style={{ border: '1px solid var(--color-divider)', borderRadius: 10, padding: 12, display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 4, fontSize: 12 }}>
        <button type="button" className="btn btn-ghost" style={{ padding: '2px 6px' }} onClick={onClose}>
          <Icon name="home" size={12} style={{ marginRight: 4 }} />
          Library
        </button>
        {breadcrumb.map((f) => (
          <span key={f.id} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <Icon name="chevronRight" size={11} style={{ opacity: 0.4 }} />
            <button type="button" className="btn btn-ghost" style={{ padding: '2px 6px' }} onClick={() => onOpenFolder(f.id)}>
              {f.name}
            </button>
          </span>
        ))}
        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <Icon name="chevronRight" size={11} style={{ opacity: 0.4 }} />
          <span style={{ padding: '2px 6px', fontWeight: 700 }}>{folder.name}</span>
        </span>
        <button type="button" className="btn btn-ghost btn-icon" style={{ marginLeft: 'auto' }} aria-label="Close" onClick={onClose}>
          <Icon name="x" size={13} />
        </button>
      </div>

      <div className="folder-inspector-grid" style={{ display: 'grid', gap: 16 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0 }}>
          <span className="text-muted" style={{ fontSize: 12 }}>Contents</span>
          {childFolders.length === 0 && childItems.length === 0 ? (
            <p className="text-muted" style={{ margin: 0, fontSize: 13 }}>This folder is empty.</p>
          ) : (
            <div className="library-grid">
              {childFolders.map((f) => (
                <FolderCard
                  key={f.id}
                  folder={f}
                  itemCount={items.filter((i) => (i.folderId ?? null) === f.id).length}
                  onOpen={onOpenFolder}
                  onRename={onRenameFolder}
                  onDelete={onDeleteFolder}
                  onMove={onMoveFolder}
                />
              ))}
              {childItems.map((item) => (
                <LibraryCard
                  key={item.id}
                  item={item}
                  onRemove={onRemoveItem}
                  onRename={onRenameItem}
                  onSetTags={onSetItemTags}
                  onConfigure={onConfigureItem}
                  onMove={onMoveItem}
                  onPreview={onOpenItem}
                />
              ))}
            </div>
          )}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0 }}>
          <span className="text-muted" style={{ fontSize: 12 }}>Metadata</span>
          {editing ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <input
                className="input"
                style={{ flex: 1, fontSize: 13, padding: '4px 6px' }}
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
              <Icon name="folder" size={16} style={{ opacity: 0.8, flexShrink: 0 }} />
              <span style={{ fontSize: 14, fontWeight: 700, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{folder.name}</span>
              <button type="button" className="btn btn-ghost btn-icon" aria-label="Rename folder" onClick={startEdit}>
                <Icon name="pencil" size={12} />
              </button>
            </div>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3, fontSize: 12 }} className="text-muted">
            {folder.createdAt && <span>Added on {new Date(folder.createdAt).toLocaleDateString()}</span>}
            <span>{childFolders.length} subfolder{childFolders.length === 1 ? '' : 's'}, {childItems.length} item{childItems.length === 1 ? '' : 's'} here</span>
            {(folderCount > childFolders.length || itemCount > childItems.length) && (
              <span>{folderCount} subfolder{folderCount === 1 ? '' : 's'}, {itemCount} item{itemCount === 1 ? '' : 's'} in total</span>
            )}
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button type="button" className="btn btn-secondary" style={{ fontSize: 12 }} onClick={() => onMoveFolder(folder)}>
              <Icon name="move" size={12} /> Move
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              style={{ fontSize: 12 }}
              title="Delete folder — contents move up a level, nothing inside is deleted"
              onClick={() => {
                onDeleteFolder(folder.id);
                onClose();
              }}
            >
              <Icon name="trash" size={12} /> Delete
            </button>
          </div>
          <span className="text-muted" style={{ fontSize: 12, marginTop: 4 }}>Structure</span>
          <FolderFlowDiagram folder={folder} folders={folders} items={items} />
        </div>
      </div>
    </div>
  );
}
