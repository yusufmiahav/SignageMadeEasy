import { useState } from 'react';
import { DialogShell } from './DialogShell';
import type { AppState } from '../../hooks/useAppState';

const TYPE_LABEL: Record<string, string> = { image: 'Image', video: 'Video', pdf: 'PDF', announcement: 'Announcement', clock: 'Clock' };

interface AddContentDialogProps {
  app: AppState;
  groupId: string;
  onClose: () => void;
}

export function AddContentDialog({ app, groupId, onClose }: AddContentDialogProps) {
  const { library, groups, addToDefaultPlaylist } = app;
  const group = groups.find((g) => g.id === groupId);
  const inDefault = new Set(group?.defaultPlaylist ?? []);
  const addable = library.filter((l) => !inDefault.has(l.id));
  const [checked, setChecked] = useState<Set<string>>(new Set());

  const toggle = (id: string) => {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const confirm = async () => {
    if (checked.size > 0) await addToDefaultPlaylist(groupId, Array.from(checked));
    onClose();
  };

  return (
    <DialogShell title="Add content" onClose={onClose}>
      {addable.length === 0 ? (
        <p className="dialog-body">Everything in your library is already on this schedule.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, maxHeight: 260, overflowY: 'auto' }}>
          {addable.map((item) => (
            <label key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: '1px solid var(--color-divider)', cursor: 'pointer' }}>
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
          ))}
        </div>
      )}
      <div className="dialog-actions">
        <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
        <button type="button" className="btn btn-primary" onClick={() => void confirm()}>Add selected</button>
      </div>
    </DialogShell>
  );
}
