import { useRef } from 'react';
import { Icon } from '../components/icons/Icon';
import { LibraryCard } from '../components/LibraryCard';
import type { AppState } from '../hooks/useAppState';

interface LibraryScreenProps {
  app: AppState;
  onOpenAnnounceDialog: () => void;
}

export function LibraryScreen({ app, onOpenAnnounceDialog }: LibraryScreenProps) {
  const { library, addImage, addVideo, addPdf, addClock, removeLibraryItem, renameLibraryItem } = app;
  const imageInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const pdfInputRef = useRef<HTMLInputElement>(null);

  const handleImages = async (files: FileList | null) => {
    if (!files) return;
    for (const file of Array.from(files)) {
      if (file.type.startsWith('image/')) await addImage(file);
    }
  };

  // Dropzone accepts both images and videos, one per file by MIME type — the
  // dedicated "Add video" button/input still exists for a deliberate single-file
  // pick, this just covers the drag-and-drop path too.
  const handleDropped = async (files: FileList | null) => {
    if (!files) return;
    for (const file of Array.from(files)) {
      if (file.type.startsWith('image/')) await addImage(file);
      else if (file.type.startsWith('video/')) await addVideo(file);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <input
        ref={imageInputRef}
        type="file"
        accept="image/*"
        multiple
        style={{ display: 'none' }}
        onChange={(e) => {
          void handleImages(e.target.files);
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
          if (file) void addVideo(file);
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
          if (file) void addPdf(file);
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
        onClick={() => imageInputRef.current?.click()}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          void handleDropped(e.dataTransfer.files);
        }}
      >
        <Icon name="uploadCloud" size={20} />
        <p className="text-muted" style={{ margin: 0, fontSize: 13 }}>Drag and drop images or videos here, or click to upload</p>
      </div>

      {library.length === 0 ? (
        <p className="text-muted" style={{ margin: 0 }}>No content yet.</p>
      ) : (
        <div className="library-grid">
          {library.map((item) => (
            <LibraryCard key={item.id} item={item} onRemove={removeLibraryItem} onRename={renameLibraryItem} />
          ))}
        </div>
      )}
    </div>
  );
}
