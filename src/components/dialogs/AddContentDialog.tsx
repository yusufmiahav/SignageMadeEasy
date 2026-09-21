import { useState } from 'react';
import { DialogShell } from './DialogShell';
import { FolderTreeList } from '../FolderTreeList';
import type { AppState } from '../../hooks/useAppState';
import type { LibraryItem } from '../../api/types';

const TYPE_LABEL: Record<string, string> = { image: 'Image', video: 'Video', pdf: 'PDF', announcement: 'Announcement', clock: 'Clock' };

interface AddContentDialogProps {
  app: AppState;
  /** The default playlist's current contents (a location's or a device's own) — used to hide items already on it. */
  alreadyIncludedIds: string[];
  onConfirm: (ids: string[]) => Promise<void>;
  onClose: () => void;
}

export function AddContentDialog({ app, alreadyIncludedIds, onConfirm, onClose }: AddContentDialogProps) {
  const { library, folders } = app;
  const inDefault = new Set(alreadyIncludedIds);
  // Announcements aren't playlist content — they run as their own overlay (see the
  // Announcements tab), resolved entirely separately from a group's rotation.
  const addable = library.filter((l) => l.type !== 'announcement' && !inDefault.has(l.id));
  const [checked, setChecked] = useState<Set<string>>(new Set());

  const toggle = (id: string) => {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const confirm = async () => {
    if (checked.size > 0) await onConfirm(Array.from(checked));
    onClose();
  };

  const renderItem = (item: LibraryItem) => (
    <label style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: '1px solid var(--color-divider)', cursor: 'pointer' }}>
      <input type="checkbox" checked={checked.has(item.id)} onChange={() => toggle(item.id)} />
      {item.type === 'image' && item.thumb && (
        <div
          style={{
            width: 32,
            height: 32,
            flexShrink: 0,
            borderRadius: 4,
            backgroundColor: 'var(--color-neutral-200)',
            backgroundImage: `url(${item.thumb})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
          }}
        />
      )}
      <span style={{ flex: 1, fontSize: 13, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.name}</span>
      <span className="tag tag-neutral">{TYPE_LABEL[item.type]}</span>
    </label>
  );

  return (
    <DialogShell title="Add content" onClose={onClose}>
      <FolderTreeList
        folders={folders}
        items={addable}
        renderItem={renderItem}
        emptyMessage="Everything in your library is already on this schedule."
      />
      <div className="dialog-actions">
        <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
        <button type="button" className="btn btn-primary" onClick={() => void confirm()}>Add selected</button>
      </div>
    </DialogShell>
  );
}
