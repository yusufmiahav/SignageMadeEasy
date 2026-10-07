import { useState } from 'react';
import { DialogShell } from './DialogShell';
import { Icon } from '../icons/Icon';
import type { Folder } from '../../api/types';

/** True if `id` is `ancestorId` itself or a descendant of it — walks `id`'s own ancestor chain looking for `ancestorId`. Used to exclude a folder (and everywhere inside it) from its own move-target list, so a folder can never become its own descendant. */
function isSelfOrDescendant(folders: Folder[], ancestorId: string, id: string): boolean {
  let current: string | null = id;
  while (current != null) {
    if (current === ancestorId) return true;
    current = folders.find((f) => f.id === current)?.parentId ?? null;
  }
  return false;
}

/** Flattens the folder tree into a depth-first, indented list — same order a real folder tree reads in. */
function buildTree(folders: Folder[], parentId: string | null, depth: number): { folder: Folder; depth: number }[] {
  const children = folders.filter((f) => f.parentId === parentId).sort((a, b) => a.name.localeCompare(b.name));
  return children.flatMap((f) => [{ folder: f, depth }, ...buildTree(folders, f.id, depth + 1)]);
}

interface MoveToFolderDialogProps {
  folders: Folder[];
  title: string;
  /** Preselects this folder (or the root, for null) — usually wherever the thing being moved already lives. */
  currentFolderId: string | null;
  /** Set only when moving a folder itself (not a library item) — excludes that folder and everything inside it from the target list, since nesting a folder inside its own subtree isn't a valid move. Omit when moving a library item; any folder is always a valid destination for one of those. */
  excludeSubtreeOf?: string;
  onConfirm: (folderId: string | null) => void;
  onClose: () => void;
}

export function MoveToFolderDialog({ folders, title, currentFolderId, excludeSubtreeOf, onConfirm, onClose }: MoveToFolderDialogProps) {
  const [selected, setSelected] = useState<string | null>(currentFolderId);
  const entries = buildTree(folders, null, 0).filter(
    ({ folder }) => !excludeSubtreeOf || !isSelfOrDescendant(folders, excludeSubtreeOf, folder.id),
  );

  const confirm = () => {
    onConfirm(selected);
    onClose();
  };

  return (
    <DialogShell title={title} onClose={onClose}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2, maxHeight: '50vh', overflowY: 'auto' }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 4px', cursor: 'pointer' }}>
          <input type="radio" name="move-target" checked={selected === null} onChange={() => setSelected(null)} />
          <Icon name="home" size={14} />
          <span style={{ fontSize: 13 }}>Library root</span>
        </label>
        {entries.map(({ folder, depth }) => (
          <label key={folder.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 4px', paddingLeft: 12 + depth * 20, cursor: 'pointer' }}>
            <input type="radio" name="move-target" checked={selected === folder.id} onChange={() => setSelected(folder.id)} />
            <Icon name="folder" size={14} />
            <span style={{ fontSize: 13 }}>{folder.name}</span>
          </label>
        ))}
        {entries.length === 0 && excludeSubtreeOf && (
          <p className="dialog-body text-muted" style={{ margin: 0 }}>No other folders to move into yet.</p>
        )}
      </div>
      <div className="dialog-actions">
        <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
        <button type="button" className="btn btn-primary" onClick={confirm}>Move</button>
      </div>
    </DialogShell>
  );
}
