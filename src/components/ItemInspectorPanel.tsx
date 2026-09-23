import { useState } from 'react';
import { Icon } from './icons/Icon';
import { PreviewContent } from './PreviewContent';
import { TYPE_ICON, TYPE_LABEL, metaText, downloadUrlFor } from './libraryItemMeta';
import type { Folder, LibraryItem } from '../api/types';

interface ItemInspectorPanelProps {
  item: LibraryItem;
  folders: Folder[];
  onClose: () => void;
  onOpenFolder: (id: string) => void;
  onRemove: (id: string) => void;
  onRename: (id: string, name: string) => void;
  onSetTags: (id: string, tags: string[]) => void;
  onConfigure: (item: LibraryItem) => void;
  onMove: (item: LibraryItem) => void;
}

/**
 * Inline split panel shown above LibraryTreeView when an item's NAME is clicked
 * (see LibraryScreen.tsx's `opened` state) — left pane is a bigger version of the
 * same preview ContentPreviewDialog shows; right pane consolidates every action
 * that used to be scattered across per-row icon buttons (rename, tags, move,
 * download, remove, NDI/TfL configure) into one place, plus metadata.
 */
export function ItemInspectorPanel({ item, folders, onClose, onOpenFolder, onRemove, onRename, onSetTags, onConfigure, onMove }: ItemInspectorPanelProps) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(item.name);
  const [editingTags, setEditingTags] = useState(false);
  const [tagsInput, setTagsInput] = useState('');
  const downloadUrl = downloadUrlFor(item);
  const folder = folders.find((f) => f.id === item.folderId);

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
    <div style={{ border: '1px solid var(--color-divider)', borderRadius: 10, padding: 12, display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <button type="button" className="btn btn-ghost" style={{ padding: '2px 6px', fontSize: 12 }} onClick={onClose}>
          <Icon name="home" size={12} style={{ marginRight: 4 }} />
          Library
        </button>
        {folder && (
          <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12 }}>
            <Icon name="chevronRight" size={11} style={{ opacity: 0.4 }} />
            <button type="button" className="btn btn-ghost" style={{ padding: '2px 6px' }} onClick={() => onOpenFolder(folder.id)}>
              {folder.name}
            </button>
          </span>
        )}
        <button type="button" className="btn btn-ghost btn-icon" style={{ marginLeft: 'auto' }} aria-label="Close" onClick={onClose}>
          <Icon name="x" size={13} />
        </button>
      </div>

      <div className="item-inspector-grid" style={{ display: 'grid', gap: 16 }}>
        <div style={{ minWidth: 0 }}>
          <span className="text-muted" style={{ fontSize: 12 }}>Preview</span>
          <div style={{ marginTop: 8 }}>
            <PreviewContent item={item} autoPlay={false} />
          </div>
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
              <Icon name={TYPE_ICON[item.type]} size={16} style={{ opacity: 0.8, flexShrink: 0 }} />
              <span style={{ fontSize: 14, fontWeight: 700, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.name}</span>
              <button type="button" className="btn btn-ghost btn-icon" aria-label="Rename" onClick={startEdit}>
                <Icon name="pencil" size={12} />
              </button>
            </div>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3, fontSize: 12 }} className="text-muted">
            <span>{TYPE_LABEL[item.type]}{metaText(item) ? ` · ${metaText(item)}` : ''}</span>
            {item.createdAt && <span>Added on {new Date(item.createdAt).toLocaleDateString()}</span>}
            <span>{folder ? `In ${folder.name}` : 'In library root'}</span>
          </div>

          {editingTags ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <input
                className="input"
                style={{ flex: 1, fontSize: 12, padding: '3px 6px' }}
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

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
            <button type="button" className="btn btn-secondary" style={{ fontSize: 12 }} onClick={() => onMove(item)}>
              <Icon name="move" size={12} /> Move
            </button>
            {(item.type === 'ndi' || item.type === 'tfl-status' || item.type === 'tfl-arrivals') && (
              <button type="button" className="btn btn-secondary" style={{ fontSize: 12 }} onClick={() => onConfigure(item)}>
                <Icon name="sliders" size={12} /> Edit options
              </button>
            )}
            {downloadUrl && (
              <a className="btn btn-secondary" style={{ fontSize: 12 }} href={downloadUrl} download={item.name} target="_blank" rel="noreferrer">
                <Icon name="download" size={12} /> Download
              </a>
            )}
            <button
              type="button"
              className="btn btn-secondary"
              style={{ fontSize: 12 }}
              onClick={() => {
                onRemove(item.id);
                onClose();
              }}
            >
              <Icon name="trash" size={12} /> Remove
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
