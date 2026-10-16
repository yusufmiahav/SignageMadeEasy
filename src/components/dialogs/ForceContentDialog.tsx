import { useState } from 'react';
import { DialogShell } from './DialogShell';
import { Icon } from '../icons/Icon';
import { FolderTreeList } from '../FolderTreeList';
import { PlaylistRow } from '../PlaylistRow';
import { PreviewContent } from '../PreviewContent';
import type { AppState } from '../../hooks/useAppState';
import type { LibraryItem } from '../../api/types';

// Its own component (not a bare JSX-returning helper) so each row's preview toggle
// gets independent, stable state via React's own per-element hook storage — the
// addable list's length changes every time something is selected/deselected, which
// would break a useState called directly inside a plain per-item render function.
function AddableRow({ item, onAdd }: { item: LibraryItem; onAdd: () => void }) {
  const [previewOpen, setPreviewOpen] = useState(false);
  return (
    <div style={{ borderBottom: '1px solid var(--color-divider)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0' }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 0, cursor: 'pointer' }}>
          <input type="checkbox" checked={false} onChange={onAdd} />
          <span style={{ flex: 1, fontSize: 13, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.name}</span>
        </label>
        <button
          type="button"
          className={`btn btn-icon ${previewOpen ? 'btn-secondary' : 'btn-ghost'}`}
          aria-label={previewOpen ? 'Hide preview' : 'Preview'}
          title="Check this is the right asset before it goes live"
          onClick={() => setPreviewOpen((v) => !v)}
        >
          <Icon name="eye" size={13} />
        </button>
      </div>
      {previewOpen && (
        <div style={{ padding: '0 0 10px' }}>
          <PreviewContent item={item} autoPlay={false} />
        </div>
      )}
    </div>
  );
}

interface ForceContentDialogProps {
  app: AppState;
  /** e.g. "this group" or "every screen" — used in the dialog copy only. */
  scopeLabel: string;
  /** True for the Home tab's "every screen" action — shows an extra warning, since it's easy to click without meaning to affect the whole fleet. */
  isGlobal: boolean;
  /** The forced playlist's current contents, in order — empty means not currently forced. */
  currentIds: string[];
  onConfirm: (libIds: string[]) => Promise<void>;
  onClose: () => void;
}

export function ForceContentDialog({ app, scopeLabel, isGlobal, currentIds, onConfirm, onClose }: ForceContentDialogProps) {
  const { library, folders } = app;
  const [selected, setSelected] = useState<string[]>(currentIds);
  const byId = new Map(library.map((item) => [item.id, item]));
  const selectedItems = selected.map((id) => byId.get(id)).filter((i): i is LibraryItem => !!i);
  const selectedSet = new Set(selected);
  // Announcements aren't playlist content — they run as their own overlay, resolved
  // entirely separately from a group's rotation (same exclusion as AddContentDialog).
  const addable = library.filter((item) => item.type !== 'announcement' && !selectedSet.has(item.id));

  const confirm = async () => {
    await onConfirm(selected);
    onClose();
  };

  const move = (id: string, direction: 'up' | 'down') => {
    const idx = selected.indexOf(id);
    const swapWith = direction === 'up' ? idx - 1 : idx + 1;
    if (idx < 0 || swapWith < 0 || swapWith >= selected.length) return;
    const list = [...selected];
    [list[idx], list[swapWith]] = [list[swapWith], list[idx]];
    setSelected(list);
  };

  const renderAddable = (item: LibraryItem) => (
    <AddableRow item={item} onAdd={() => setSelected([...selected, item.id])} />
  );

  return (
    <DialogShell title={currentIds.length > 0 ? 'Edit forced content' : 'Force content'} onClose={onClose}>
      <p className="dialog-body" style={{ margin: 0 }}>
        Stops the rolling schedule on {scopeLabel} and plays this fixed sequence — in order, looping — until you turn it off. Add more than one item to force a playlist instead of just one piece of content.
      </p>
      {isGlobal && selected.length > 0 && (
        <div className="dialog-warning">
          <Icon name="alertTriangle" size={16} />
          <span>This forces content onto every screen — grouped or standalone — not just the one you're looking at.</span>
        </div>
      )}
      <button type="button" className="btn btn-secondary btn-block" disabled={selected.length === 0} onClick={() => setSelected([])}>
        Back to rolling schedule
      </button>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <h2 style={{ margin: 0, fontSize: 13, textTransform: 'uppercase', letterSpacing: '0.06em', opacity: 0.6 }}>Forced playlist</h2>
        {selectedItems.length === 0 ? (
          <p className="text-muted" style={{ margin: 0, fontSize: 13 }}>Nothing forced — pick from your library below.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {selectedItems.map((item, i) => (
              <PlaylistRow
                key={item.id}
                item={item}
                order={i + 1}
                upDisabled={i === 0}
                downDisabled={i === selectedItems.length - 1}
                onMoveUp={() => move(item.id, 'up')}
                onMoveDown={() => move(item.id, 'down')}
                onRemove={() => setSelected(selected.filter((id) => id !== item.id))}
                onSetDuration={(durationSec) => app.setItemDuration(item.id, durationSec)}
              />
            ))}
          </div>
        )}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <h2 style={{ margin: 0, fontSize: 13, textTransform: 'uppercase', letterSpacing: '0.06em', opacity: 0.6 }}>Add content</h2>
        <FolderTreeList
          folders={folders}
          items={addable}
          renderItem={renderAddable}
          emptyMessage="Everything in your library is already in this playlist."
        />
      </div>

      <div className="dialog-actions">
        <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
        <button type="button" className={isGlobal && selected.length > 0 ? 'btn btn-warning' : 'btn btn-primary'} onClick={() => void confirm()}>Apply</button>
      </div>
    </DialogShell>
  );
}
