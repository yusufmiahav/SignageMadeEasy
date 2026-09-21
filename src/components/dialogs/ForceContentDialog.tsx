import { useState } from 'react';
import { DialogShell } from './DialogShell';
import { Icon } from '../icons/Icon';
import { FolderTreeList } from '../FolderTreeList';
import type { AppState } from '../../hooks/useAppState';
import type { LibraryItem } from '../../api/types';

interface ForceContentDialogProps {
  app: AppState;
  /** e.g. "this group" or "every screen" — used in the dialog copy only. */
  scopeLabel: string;
  /** True for the Home tab's "every screen" action — shows an extra warning, since it's easy to click without meaning to affect the whole fleet. */
  isGlobal: boolean;
  currentId: string | null;
  onConfirm: (libId: string | null) => Promise<void>;
  onClose: () => void;
}

export function ForceContentDialog({ app, scopeLabel, isGlobal, currentId, onConfirm, onClose }: ForceContentDialogProps) {
  const { library, folders } = app;
  const [choiceId, setChoiceId] = useState<string | null>(currentId);
  const pickable = library.filter((item) => item.type !== 'announcement');

  const confirm = async () => {
    await onConfirm(choiceId);
    onClose();
  };

  const renderItem = (item: LibraryItem) => (
    <label className="radio">
      <input type="radio" name="forceContentPick" checked={choiceId === item.id} onChange={() => setChoiceId(item.id)} />
      <span className="dot" />
      {item.name}
    </label>
  );

  return (
    <DialogShell title="Force content" onClose={onClose}>
      <p className="dialog-body" style={{ margin: 0 }}>
        Stops the rolling schedule on {scopeLabel} and shows one piece of content until you turn it off.
      </p>
      {isGlobal && choiceId != null && (
        <div className="dialog-warning">
          <Icon name="alertTriangle" size={16} />
          <span>This forces content onto every screen — grouped or standalone — not just the one you're looking at.</span>
        </div>
      )}
      <label className="radio">
        <input type="radio" name="forceContentPick" checked={choiceId == null} onChange={() => setChoiceId(null)} />
        <span className="dot" />
        Back to rolling schedule
      </label>
      <FolderTreeList folders={folders} items={pickable} renderItem={renderItem} />
      <div className="dialog-actions">
        <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
        <button type="button" className={isGlobal && choiceId != null ? 'btn btn-warning' : 'btn btn-primary'} onClick={() => void confirm()}>Apply</button>
      </div>
    </DialogShell>
  );
}
