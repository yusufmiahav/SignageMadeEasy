import { useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { Icon } from '../components/icons/Icon';
import { LibraryCard } from '../components/LibraryCard';
import type { AppState } from '../hooks/useAppState';
import type { LibraryItem } from '../api/types';

interface LibraryScreenProps {
  app: AppState;
  onOpenAnnounceDialog: () => void;
}

interface InFlightUpload {
  key: string;
  name: string;
  pct: number;
}

export function LibraryScreen({ app, onOpenAnnounceDialog }: LibraryScreenProps) {
  const { library, addImage, addVideo, addPdf, addClock, removeLibraryItem, renameLibraryItem, reorderLibrary } = app;
  const dropzoneInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const pdfInputRef = useRef<HTMLInputElement>(null);
  const [uploads, setUploads] = useState<InFlightUpload[]>([]);

  // Tracks the raw upload transfer for each in-flight file (not the hub's own
  // post-upload processing, e.g. video capping — that shows up as a "Decoding…"
  // badge on the card itself once the item lands, via LibraryCard's transcodeStatus).
  const trackUpload = async <T,>(file: File, upload: (file: File, onProgress: (pct: number) => void) => Promise<T>): Promise<T> => {
    const key = `${file.name}-${file.size}-${Date.now()}`;
    setUploads((prev) => [...prev, { key, name: file.name, pct: 0 }]);
    try {
      return await upload(file, (pct) => {
        setUploads((prev) => prev.map((u) => (u.key === key ? { ...u, pct } : u)));
      });
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
    draggedIdRef.current = null;
    if (dragOrderRef.current) void reorderLibrary(dragOrderRef.current);
    dragOrderRef.current = null;
    setDragOrder(null);
  };

  const handlePointerMove = (e: ReactPointerEvent) => {
    if (!draggedIdRef.current) return;
    e.preventDefault();
    const el = document.elementFromPoint(e.clientX, e.clientY);
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
          <button type="button" className="btn btn-secondary btn-icon mobile-only" aria-label="Add video" onClick={() => videoInputRef.current?.click()}>
            <Icon name="video" size={15} />
          </button>
          <button type="button" className="btn btn-secondary btn-icon mobile-only" aria-label="Add PDF" onClick={() => pdfInputRef.current?.click()}>
            <Icon name="fileText" size={15} />
          </button>
          <button type="button" className="btn btn-secondary btn-icon mobile-only" aria-label="Add announcement" onClick={onOpenAnnounceDialog}>
            <Icon name="messageCircle" size={15} />
          </button>
          <button type="button" className="btn btn-secondary btn-icon mobile-only" aria-label="Add clock" onClick={() => void addClock('Clock')}>
            <Icon name="clock" size={15} />
          </button>
          <button type="button" className="btn btn-secondary desktop-only" onClick={() => videoInputRef.current?.click()}>Add video</button>
          <button type="button" className="btn btn-secondary desktop-only" onClick={() => pdfInputRef.current?.click()}>Add PDF</button>
          <button type="button" className="btn btn-secondary desktop-only" onClick={onOpenAnnounceDialog}>Add announcement</button>
          <button type="button" className="btn btn-secondary desktop-only" onClick={() => void addClock('Clock')}>Add clock</button>
        </div>
      </div>

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

      {library.length === 0 ? (
        <p className="text-muted" style={{ margin: 0 }}>No content yet.</p>
      ) : (
        <div className="library-grid">
          {displayItems.map((item) => (
            <LibraryCard
              key={item.id}
              item={item}
              onRemove={removeLibraryItem}
              onRename={renameLibraryItem}
              isDragging={draggedIdRef.current === item.id}
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
    </div>
  );
}
