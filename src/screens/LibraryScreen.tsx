import { useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { Icon } from '../components/icons/Icon';
import { LibraryCard } from '../components/LibraryCard';
import { FolderCard } from '../components/FolderCard';
import { LibraryTreeView } from '../components/LibraryTreeView';
import { LibraryAddChooserDialog } from '../components/dialogs/LibraryAddChooserDialog';
import { LibraryMoreOptionsDialog } from '../components/dialogs/LibraryMoreOptionsDialog';
import { NewFolderDialog } from '../components/dialogs/NewFolderDialog';
import { MoveToFolderDialog } from '../components/dialogs/MoveToFolderDialog';
import type { AppState } from '../hooks/useAppState';
import type { Folder, LibraryItem } from '../api/types';

interface LibraryScreenProps {
  app: AppState;
  onOpenAnnounceDialog: () => void;
  onOpenNdiDialog: () => void;
  onOpenTflDialog: () => void;
  onOpenTflArrivalsDialog: () => void;
  onConfigureTflItem: (item: LibraryItem) => void;
  onPreviewContent: (item: LibraryItem) => void;
}

interface InFlightUpload {
  key: string;
  name: string;
  pct: number;
}

export function LibraryScreen({ app, onOpenAnnounceDialog, onOpenNdiDialog, onOpenTflDialog, onOpenTflArrivalsDialog, onConfigureTflItem, onPreviewContent }: LibraryScreenProps) {
  const {
    library, folders, addImage, addVideo, addPdf, addClock, removeLibraryItem, removeLibraryItems, renameLibraryItem, setLibraryItemTags,
    setLibraryItemFolder, addFolder, renameFolder, moveFolder, removeFolder, reorderLibrary, showToast,
  } = app;
  const dropzoneInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const pdfInputRef = useRef<HTMLInputElement>(null);
  const [uploads, setUploads] = useState<InFlightUpload[]>([]);
  const [showAddChooser, setShowAddChooser] = useState(false);
  const [showMoreOptions, setShowMoreOptions] = useState(false);

  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | LibraryItem['type']>('all');
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  const allTags = [...new Set(library.flatMap((item) => item.tags))].sort();

  // ---- Folders ----
  // 'grid' (default): navigate one folder at a time via breadcrumb, same as a normal
  // file browser. 'tree': the whole hierarchy as one expandable outline for quickly
  // seeing what's where and reorganizing without repeated in/out navigation — see
  // LibraryTreeView.tsx.
  const [view, setView] = useState<'grid' | 'tree'>('grid');
  // null = library root. Browsing a folder scopes both the type/tag/search filters
  // above and the drag-to-reorder list below to just that folder's own contents —
  // a subfolder shows up as its own tile rather than flattening its items into view.
  // Only meaningful in grid view — tree view shows every folder at every depth at once.
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [moveItemTarget, setMoveItemTarget] = useState<LibraryItem | null>(null);
  const [moveFolderTarget, setMoveFolderTarget] = useState<Folder | null>(null);
  // Currently-hovered folder tile while dragging a library item over it — see
  // handlePointerMove below. Drives both the drop-target highlight and, on release,
  // whether the drag ends in a move-into-folder instead of the usual reorder.
  const [dropFolderId, setDropFolderId] = useState<string | null>(null);

  const breadcrumb: Folder[] = [];
  for (let cursor = folders.find((f) => f.id === currentFolderId); cursor; cursor = folders.find((f) => f.id === cursor?.parentId)) {
    breadcrumb.unshift(cursor);
  }
  const childFolders = folders
    .filter((f) => (f.parentId ?? null) === currentFolderId)
    .sort((a, b) => a.name.localeCompare(b.name));
  const itemCountInFolder = (folderId: string) => library.filter((item) => (item.folderId ?? null) === folderId).length;

  // A folder's own id and a library item's own id can share this one selection set —
  // they're independently prefixed ('f'/'l', see hub/src/store.ts's uid()) and never
  // collide, so bulk delete/move below just checks which array an id actually
  // belongs to rather than needing two separate selection sets.
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const exitSelectMode = () => {
    setSelectMode(false);
    setSelectedIds(new Set());
  };
  const deleteSelected = async () => {
    const folderIds = folders.filter((f) => selectedIds.has(f.id)).map((f) => f.id);
    const itemIds = library.filter((i) => selectedIds.has(i.id)).map((i) => i.id);
    await Promise.all([
      itemIds.length > 0 ? removeLibraryItems(itemIds) : Promise.resolve(),
      ...folderIds.map((id) => removeFolder(id)),
    ]);
    setSelectedIds(new Set());
    setSelectMode(false);
    // Overrides whichever of removeLibraryItems'/removeFolder's own toasts happened
    // to fire last above — a mixed selection needs one summary, not just one of them.
    if (folderIds.length > 0 && itemIds.length > 0) {
      showToast(`${itemIds.length} item${itemIds.length === 1 ? '' : 's'} deleted, ${folderIds.length} folder${folderIds.length === 1 ? '' : 's'} removed (contents moved up a level)`);
    }
  };
  const [showMoveSelected, setShowMoveSelected] = useState(false);
  const moveSelected = async (folderId: string | null) => {
    const folderIds = folders.filter((f) => selectedIds.has(f.id)).map((f) => f.id);
    const itemIds = library.filter((i) => selectedIds.has(i.id)).map((i) => i.id);
    const count = selectedIds.size;
    const results = await Promise.allSettled([
      ...itemIds.map((id) => setLibraryItemFolder(id, folderId)),
      ...folderIds.map((id) => moveFolder(id, folderId)),
    ]);
    const failed = results.filter((r) => r.status === 'rejected').length;
    setSelectedIds(new Set());
    setSelectMode(false);
    if (failed > 0) {
      showToast(`${count - failed} moved, ${failed} couldn't be (can't move a folder into itself or its own subfolder)`);
    } else {
      showToast(`${count} moved`);
    }
  };

  // Tracks the raw upload transfer for each in-flight file (not the hub's own
  // post-upload processing, e.g. video capping — that shows up as a "Decoding…"
  // badge on the card itself once the item lands, via LibraryCard's transcodeStatus).
  const trackUpload = async <T,>(file: File, upload: (file: File, onProgress: (pct: number) => void) => Promise<T>): Promise<T | undefined> => {
    const key = `${file.name}-${file.size}-${Date.now()}`;
    setUploads((prev) => [...prev, { key, name: file.name, pct: 0 }]);
    try {
      return await upload(file, (pct) => {
        setUploads((prev) => prev.map((u) => (u.key === key ? { ...u, pct } : u)));
      });
    } catch (err) {
      showToast(err instanceof Error ? err.message : `${file.name} failed to upload`);
      return undefined;
    } finally {
      setUploads((prev) => prev.filter((u) => u.key !== key));
    }
  };

  // Shared by both the dropzone's own drag-and-drop and its click-to-browse input
  // (accept="image/*,video/*") — one file list, routed per file by MIME type, so
  // "click to upload" actually offers the same two types the dropzone's own label
  // promises instead of silently restricting to images.
  const handleDropped = async (files: FileList | null) => {
    if (!files) return;
    for (const file of Array.from(files)) {
      if (file.type.startsWith('image/')) await trackUpload(file, addImage);
      else if (file.type.startsWith('video/')) await trackUpload(file, addVideo);
    }
  };

  // ---- Drag-to-reorder ----
  // Pointer Events rather than native HTML5 drag-and-drop: the HTML5 DnD API
  // (draggable + dragstart/dragover/drop) simply doesn't fire from touch input on
  // mobile browsers at all, which made this unusable on a phone - Pointer Events
  // fire uniformly for mouse, touch, and pen, so this one implementation covers
  // both. Reorders live as the dragged card passes over another (classic
  // "shift as you drag" list behavior), persisted once via reorderLibrary on
  // release rather than on every intermediate shuffle. Which card is "under" the
  // pointer is found via elementFromPoint + a data-library-id attribute on each
  // card's root, since pointer capture keeps delivering move/up events to the
  // handle that was originally grabbed regardless of where the pointer travels.
  const [dragOrder, setDragOrder] = useState<string[] | null>(null);
  const draggedIdRef = useRef<string | null>(null);
  // The source of truth for the in-progress order, updated synchronously in each
  // handler body — NOT inside setDragOrder's functional updater. React 18's
  // automatic batching only guarantees a functional updater runs by the time of the
  // next render, not synchronously at call time; a burst of pointer events fired
  // back-to-back with no render landing in between (confirmed directly: React 19
  // batches these and defers the updater past the whole synchronous event chain, so
  // mirroring the ref *inside* the updater ran too late for handleDragEnd to see it)
  // needs a plain, immediately-updated ref instead. dragOrder (state) still exists
  // purely to trigger the visual re-render during the drag.
  const dragOrderRef = useRef<string[] | null>(null);
  const orderedIds = dragOrder ?? library.map((item) => item.id);
  const displayItems = orderedIds
    .map((id) => library.find((item) => item.id === id))
    .filter((item): item is LibraryItem => !!item);
  const matchesFilters = (item: LibraryItem) => {
    if (typeFilter !== 'all' && item.type !== typeFilter) return false;
    if (tagFilter && !item.tags.includes(tagFilter)) return false;
    if (search.trim() && !item.name.toLowerCase().includes(search.trim().toLowerCase())) return false;
    return true;
  };
  const filteredItems = displayItems.filter((item) => (item.folderId ?? null) === currentFolderId && matchesFilters(item));
  // Tree view shows the whole hierarchy at once rather than one folder at a time, so
  // this deliberately skips the folderId scoping above — every matching item appears
  // wherever it's actually filed.
  const treeItems = library.filter(matchesFilters);

  const handleDragStart = (id: string) => {
    draggedIdRef.current = id;
    const initial = library.map((item) => item.id);
    dragOrderRef.current = initial;
    setDragOrder(initial);
  };

  const handleDragEnter = (overId: string) => {
    const dragged = draggedIdRef.current;
    if (!dragged || dragged === overId) return;
    const current = dragOrderRef.current ?? library.map((item) => item.id);
    const from = current.indexOf(dragged);
    const to = current.indexOf(overId);
    if (from === -1 || to === -1) return;
    const next = [...current];
    next.splice(from, 1);
    next.splice(to, 0, dragged);
    dragOrderRef.current = next;
    setDragOrder(next);
  };

  const handleDragEnd = () => {
    const draggedId = draggedIdRef.current;
    draggedIdRef.current = null;
    // Dropped on a folder tile — files the item there instead of reordering; the
    // in-progress reorder state (which only ever reflected a preview, not a
    // persisted change) is simply discarded.
    if (dropFolderId && draggedId) {
      void setLibraryItemFolder(draggedId, dropFolderId);
      setDropFolderId(null);
      dragOrderRef.current = null;
      setDragOrder(null);
      return;
    }
    if (dragOrderRef.current) void reorderLibrary(dragOrderRef.current);
    dragOrderRef.current = null;
    setDragOrder(null);
  };

  const handlePointerMove = (e: ReactPointerEvent) => {
    if (!draggedIdRef.current) return;
    e.preventDefault();
    const el = document.elementFromPoint(e.clientX, e.clientY);
    const folderId = (el?.closest('[data-folder-id]') as HTMLElement | null)?.dataset.folderId;
    if (folderId) {
      setDropFolderId(folderId);
      return;
    }
    if (dropFolderId) setDropFolderId(null);
    const overId = (el?.closest('[data-library-id]') as HTMLElement | null)?.dataset.libraryId;
    if (overId) handleDragEnter(overId);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <input
        ref={dropzoneInputRef}
        type="file"
        accept="image/*,video/*"
        multiple
        style={{ display: 'none' }}
        onChange={(e) => {
          void handleDropped(e.target.files);
          e.target.value = '';
        }}
      />
      <input
        ref={imageInputRef}
        type="file"
        accept="image/*"
        multiple
        style={{ display: 'none' }}
        onChange={(e) => {
          void handleDropped(e.target.files);
          e.target.value = '';
        }}
      />
      <input
        ref={videoInputRef}
        type="file"
        accept="video/*"
        style={{ display: 'none' }}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void trackUpload(file, addVideo);
          e.target.value = '';
        }}
      />
      <input
        ref={pdfInputRef}
        type="file"
        accept=".pdf,application/pdf"
        style={{ display: 'none' }}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void trackUpload(file, addPdf);
          e.target.value = '';
        }}
      />

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h1 style={{ margin: 0 }}>Library</h1>
        <div style={{ display: 'flex', gap: 6 }}>
          <button type="button" className="btn btn-secondary btn-icon mobile-only" aria-label="New folder" title="New folder" onClick={() => setShowNewFolder(true)}>
            <Icon name="folderPlus" size={15} />
          </button>
          <button type="button" className="btn btn-secondary btn-icon mobile-only" aria-label="Add" onClick={() => setShowAddChooser(true)}>
            <Icon name="plus" size={15} />
          </button>
          <button type="button" className="btn btn-secondary desktop-only" onClick={() => imageInputRef.current?.click()}>
            <Icon name="image" size={14} /> Add image
          </button>
          <button type="button" className="btn btn-secondary desktop-only" onClick={() => videoInputRef.current?.click()}>
            <Icon name="video" size={14} /> Add video
          </button>
          <button type="button" className="btn btn-secondary desktop-only" onClick={() => setShowNewFolder(true)}>
            <Icon name="folderPlus" size={14} /> Add folder
          </button>
          <button type="button" className="btn btn-secondary desktop-only" onClick={() => setShowMoreOptions(true)}>
            <Icon name="moreHorizontal" size={14} /> More options
          </button>
          <div className="seg" style={{ padding: 0 }}>
            <button
              type="button"
              className={`btn btn-icon${view === 'grid' ? ' btn-ghost' : ' btn-secondary'}`}
              aria-label="Grid view"
              title="Grid view — browse one folder at a time"
              onClick={() => setView('grid')}
            >
              <Icon name="grid" size={14} />
            </button>
            <button
              type="button"
              className={`btn btn-icon${view === 'tree' ? ' btn-ghost' : ' btn-secondary'}`}
              aria-label="Tree view"
              title="Tree view — see the whole folder hierarchy at once"
              onClick={() => setView('tree')}
            >
              <Icon name="list" size={14} />
            </button>
          </div>
          {(selectMode ? (
            <button type="button" className="btn btn-secondary btn-icon mobile-only" aria-label="Cancel select" onClick={exitSelectMode}>
              <Icon name="x" size={15} />
            </button>
          ) : (
            <button type="button" className="btn btn-secondary btn-icon mobile-only" aria-label="Select items" onClick={() => setSelectMode(true)}>
              <Icon name="check" size={15} />
            </button>
          ))}
          <button type="button" className="btn btn-secondary desktop-only" onClick={() => (selectMode ? exitSelectMode() : setSelectMode(true))}>
            {selectMode ? 'Cancel select' : 'Select'}
          </button>
        </div>
      </div>

      {view === 'grid' && (
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 4, fontSize: 13 }}>
          <button
            type="button"
            className="btn btn-ghost"
            style={{ padding: '2px 6px', fontWeight: currentFolderId === null ? 700 : 400 }}
            onClick={() => setCurrentFolderId(null)}
          >
            <Icon name="home" size={13} style={{ marginRight: 4 }} />
            Library
          </button>
          {breadcrumb.map((folder, i) => (
            <span key={folder.id} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <Icon name="chevronRight" size={12} style={{ opacity: 0.4 }} />
              <button
                type="button"
                className="btn btn-ghost"
                style={{ padding: '2px 6px', fontWeight: i === breadcrumb.length - 1 ? 700 : 400 }}
                onClick={() => setCurrentFolderId(folder.id)}
              >
                {folder.name}
              </button>
            </span>
          ))}
        </div>
      )}

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
        <div style={{ position: 'relative', flex: '1 1 200px', minWidth: 160 }}>
          <Icon name="search" size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', opacity: 0.5 }} />
          <input
            className="input"
            style={{ width: '100%', paddingLeft: 30 }}
            placeholder="Search library…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <select className="input" style={{ width: 'auto' }} value={typeFilter} onChange={(e) => setTypeFilter(e.target.value as typeof typeFilter)}>
          <option value="all">All types</option>
          <option value="image">Image</option>
          <option value="video">Video</option>
          <option value="pdf">PDF</option>
          <option value="announcement">Announcement</option>
          <option value="clock">Clock</option>
        </select>
        {allTags.length > 0 && (
          <select className="input" style={{ width: 'auto' }} value={tagFilter ?? ''} onChange={(e) => setTagFilter(e.target.value || null)}>
            <option value="">All tags</option>
            {allTags.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        )}
      </div>

      {selectMode && (
        <div className="select-toolbar">
          <span style={{ fontSize: 13 }}>{selectedIds.size} selected</span>
          <button
            type="button"
            className="btn btn-ghost"
            style={{ fontSize: 12 }}
            onClick={() =>
              setSelectedIds(
                new Set(
                  view === 'tree'
                    ? [...folders.map((f) => f.id), ...treeItems.map((i) => i.id)]
                    : [...childFolders.map((f) => f.id), ...filteredItems.map((i) => i.id)],
                ),
              )
            }
          >
            Select all
          </button>
          {folders.length > 0 && (
            <button type="button" className="btn btn-secondary" style={{ fontSize: 12 }} disabled={selectedIds.size === 0} onClick={() => setShowMoveSelected(true)}>
              <Icon name="move" size={13} /> Move to folder
            </button>
          )}
          <button type="button" className="btn btn-secondary" style={{ fontSize: 12 }} disabled={selectedIds.size === 0} onClick={() => void deleteSelected()}>
            <Icon name="trash" size={13} /> Delete selected
          </button>
        </div>
      )}

      <div
        style={{ border: '2px dashed var(--color-divider)', padding: '22px 12px', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, cursor: 'pointer' }}
        onClick={() => dropzoneInputRef.current?.click()}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          void handleDropped(e.dataTransfer.files);
        }}
      >
        <Icon name="uploadCloud" size={20} />
        <p className="text-muted" style={{ margin: 0, fontSize: 13 }}>Drag and drop images or videos here, or click to upload</p>
      </div>

      {uploads.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {uploads.map((u) => (
            <div key={u.key} style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>Uploading {u.name}…</span>
                <span className="text-muted">{u.pct}%</span>
              </div>
              <div style={{ height: 4, borderRadius: 2, background: 'var(--color-divider)', overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${u.pct}%`, background: 'var(--color-accent)', borderRadius: 2, transition: 'width 150ms linear' }} />
              </div>
            </div>
          ))}
        </div>
      )}

      {library.length === 0 && folders.length === 0 ? (
        <p className="text-muted" style={{ margin: 0 }}>No content yet.</p>
      ) : view === 'tree' ? (
        <LibraryTreeView
          folders={folders}
          items={treeItems}
          draggedId={draggedIdRef.current}
          dropFolderId={dropFolderId}
          onDragStart={handleDragStart}
          onPointerMove={handlePointerMove}
          onDragEnd={handleDragEnd}
          onRemoveItem={removeLibraryItem}
          onRenameItem={renameLibraryItem}
          onMoveItem={setMoveItemTarget}
          onConfigureItem={onConfigureTflItem}
          onPreviewItem={onPreviewContent}
          onRenameFolder={renameFolder}
          onDeleteFolder={(id) => void removeFolder(id)}
          onMoveFolder={setMoveFolderTarget}
          selectMode={selectMode}
          selectedIds={selectedIds}
          onToggleSelect={toggleSelect}
        />
      ) : childFolders.length === 0 && filteredItems.length === 0 ? (
        <p className="text-muted" style={{ margin: 0 }}>
          {typeFilter !== 'all' || tagFilter || search.trim() ? 'No content matches your search/filters.' : 'This folder is empty.'}
        </p>
      ) : (
        <div className="library-grid">
          {childFolders.map((folder) => (
            <FolderCard
              key={folder.id}
              folder={folder}
              itemCount={itemCountInFolder(folder.id)}
              isDropTarget={dropFolderId === folder.id}
              onOpen={setCurrentFolderId}
              onRename={renameFolder}
              onDelete={(id) => void removeFolder(id)}
              onMove={setMoveFolderTarget}
              selectMode={selectMode}
              selected={selectedIds.has(folder.id)}
              onToggleSelect={toggleSelect}
            />
          ))}
          {filteredItems.map((item) => (
            <LibraryCard
              key={item.id}
              item={item}
              onRemove={removeLibraryItem}
              onRename={renameLibraryItem}
              onSetTags={setLibraryItemTags}
              onConfigure={onConfigureTflItem}
              onMove={folders.length > 0 ? setMoveItemTarget : undefined}
              onPreview={onPreviewContent}
              isDragging={draggedIdRef.current === item.id}
              selectMode={selectMode}
              selected={selectedIds.has(item.id)}
              onToggleSelect={toggleSelect}
              dragHandleProps={{
                onPointerDown: (e) => {
                  e.currentTarget.setPointerCapture(e.pointerId);
                  handleDragStart(item.id);
                },
                onPointerMove: handlePointerMove,
                onPointerUp: handleDragEnd,
                onPointerCancel: handleDragEnd,
                style: { touchAction: 'none' },
              }}
            />
          ))}
        </div>
      )}
      {showNewFolder && (
        <NewFolderDialog
          onConfirm={(name) => void addFolder(name, currentFolderId)}
          onClose={() => setShowNewFolder(false)}
        />
      )}
      {moveItemTarget && (
        <MoveToFolderDialog
          folders={folders}
          title={`Move ${moveItemTarget.name}`}
          currentFolderId={moveItemTarget.folderId ?? null}
          onConfirm={(folderId) => void setLibraryItemFolder(moveItemTarget.id, folderId)}
          onClose={() => setMoveItemTarget(null)}
        />
      )}
      {showMoveSelected && (
        <MoveToFolderDialog
          folders={folders}
          title={`Move ${selectedIds.size} selected`}
          currentFolderId={currentFolderId}
          onConfirm={(folderId) => void moveSelected(folderId)}
          onClose={() => setShowMoveSelected(false)}
        />
      )}
      {moveFolderTarget && (
        <MoveToFolderDialog
          folders={folders}
          title={`Move ${moveFolderTarget.name}`}
          currentFolderId={moveFolderTarget.parentId}
          excludeSubtreeOf={moveFolderTarget.id}
          onConfirm={(folderId) => {
            void moveFolder(moveFolderTarget.id, folderId).catch((err) => showToast(err instanceof Error ? err.message : 'Move failed'));
          }}
          onClose={() => setMoveFolderTarget(null)}
        />
      )}
      {showAddChooser && (
        <LibraryAddChooserDialog
          onAddImage={() => imageInputRef.current?.click()}
          onAddVideo={() => videoInputRef.current?.click()}
          onAddPdf={() => pdfInputRef.current?.click()}
          onAddAnnouncement={onOpenAnnounceDialog}
          onAddClock={() => void addClock('Clock')}
          onAddNdiSource={onOpenNdiDialog}
          onAddTflStatus={onOpenTflDialog}
          onAddTflArrivals={onOpenTflArrivalsDialog}
          onClose={() => setShowAddChooser(false)}
        />
      )}
      {showMoreOptions && (
        <LibraryMoreOptionsDialog
          onAddPdf={() => pdfInputRef.current?.click()}
          onAddAnnouncement={onOpenAnnounceDialog}
          onAddClock={() => void addClock('Clock')}
          onAddNdiSource={onOpenNdiDialog}
          onAddTflStatus={onOpenTflDialog}
          onAddTflArrivals={onOpenTflArrivalsDialog}
          onClose={() => setShowMoreOptions(false)}
        />
      )}
    </div>
  );
}
