import { useState, type ReactNode } from 'react';
import { Icon } from './icons/Icon';
import type { Folder, LibraryItem } from '../api/types';

interface FolderTreeListProps {
  folders: Folder[];
  /** Items to place into the tree — grouped by their own folderId (undefined/null = library root), same grouping LibraryScreen.tsx uses. */
  items: LibraryItem[];
  /** Renders one item's own row (checkbox/radio + label + whatever else a given picker needs) — the tree only handles folder grouping/indentation/expand-collapse, not selection. */
  renderItem: (item: LibraryItem) => ReactNode;
  /** Shown instead of the tree when there's nothing to pick from at all. */
  emptyMessage?: string;
}

function childFoldersOf(folders: Folder[], parentId: string | null): Folder[] {
  return folders.filter((f) => (f.parentId ?? null) === parentId).sort((a, b) => a.name.localeCompare(b.name));
}

function childItemsOf(items: LibraryItem[], folderId: string | null): LibraryItem[] {
  return items.filter((i) => (i.folderId ?? null) === folderId);
}

// Collapsed by default, same as a normal file-tree browser — a deep hierarchy
// doesn't dump every item into view at once, only the branches you actually open.
function FolderNode({ folder, depth, folders, items, renderItem }: {
  folder: Folder; depth: number; folders: Folder[]; items: LibraryItem[]; renderItem: (item: LibraryItem) => ReactNode;
}) {
  const [expanded, setExpanded] = useState(false);
  const childFolders = childFoldersOf(folders, folder.id);
  const childItems = childItemsOf(items, folder.id);
  const isEmpty = childFolders.length === 0 && childItems.length === 0;

  return (
    <div>
      <button
        type="button"
        className="btn btn-ghost"
        style={{ width: '100%', justifyContent: 'flex-start', gap: 6, padding: '6px 4px', paddingLeft: 4 + depth * 18, fontWeight: 600 }}
        onClick={() => setExpanded((e) => !e)}
        disabled={isEmpty}
      >
        <Icon name={expanded ? 'chevronDown' : 'chevronRight'} size={12} style={{ opacity: isEmpty ? 0.25 : 0.6, flexShrink: 0 }} />
        <Icon name="folder" size={14} style={{ flexShrink: 0, opacity: 0.8 }} />
        <span style={{ fontSize: 13, textAlign: 'left' }}>{folder.name}</span>
      </button>
      {expanded && (
        <div>
          {childFolders.map((f) => (
            <FolderNode key={f.id} folder={f} depth={depth + 1} folders={folders} items={items} renderItem={renderItem} />
          ))}
          {childItems.map((item) => (
            <div key={item.id} style={{ paddingLeft: 4 + (depth + 1) * 18 }}>
              {renderItem(item)}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Shared by every "pick content from the library" dialog (adding to a schedule,
 * forcing content, an event's playlist) so folders show up consistently everywhere
 * instead of just on the Library screen itself — a flat checkbox/radio list gave no
 * way to tell items apart once the library was organized into folders. Root-level
 * folders and items render first; each folder expands in place via its own chevron.
 * With no folders at all (nothing foldered yet, or a standalone/local install that
 * never used them) every item's folderId is unset, so this renders as the exact same
 * flat list as before — no behavior change until folders are actually in use.
 */
export function FolderTreeList({ folders, items, renderItem, emptyMessage }: FolderTreeListProps) {
  const rootFolders = childFoldersOf(folders, null);
  const rootItems = childItemsOf(items, null);

  if (rootFolders.length === 0 && rootItems.length === 0) {
    return emptyMessage ? <p className="dialog-body">{emptyMessage}</p> : null;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2, maxHeight: 280, overflowY: 'auto' }}>
      {rootFolders.map((folder) => (
        <FolderNode key={folder.id} folder={folder} depth={0} folders={folders} items={items} renderItem={renderItem} />
      ))}
      {rootItems.map((item) => <div key={item.id}>{renderItem(item)}</div>)}
    </div>
  );
}
