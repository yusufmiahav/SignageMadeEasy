import { useRef, useState } from 'react';
import { DialogShell } from './DialogShell';
import { Icon } from '../icons/Icon';
import { classifyMediaFile } from '../../utils/mediaFile';
import type { AppState } from '../../hooks/useAppState';

interface UploadContentDialogProps {
  app: AppState;
  onClose: () => void;
}

interface InFlightUpload {
  key: string;
  name: string;
  pct: number;
}

/**
 * A compact copy of the Library screen's own upload dropzone, reachable from Home's
 * main "+" button — lets someone add media to the library without switching tabs
 * first. Deliberately doesn't duplicate Library's drag-to-reorder/rename/tag UI,
 * just the upload path, since that's the only piece worth having available from here.
 */
export function UploadContentDialog({ app, onClose }: UploadContentDialogProps) {
  const { addImage, addVideo, addPdf, addPptx, showToast } = app;
  const dropzoneInputRef = useRef<HTMLInputElement>(null);
  const pdfInputRef = useRef<HTMLInputElement>(null);
  const pptxInputRef = useRef<HTMLInputElement>(null);
  const [uploads, setUploads] = useState<InFlightUpload[]>([]);

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

  // Classifies by MIME, falling back to the file extension — see classifyMediaFile's
  // own comment. Without the fallback, a video whose container the browser doesn't
  // recognize (e.g. .mkv/.ts/.3gp on some OS/browser combos) matched neither branch
  // and silently vanished instead of uploading.
  const handleDropped = async (files: FileList | null) => {
    if (!files) return;
    for (const file of Array.from(files)) {
      const kind = classifyMediaFile(file);
      if (kind === 'image') await trackUpload(file, addImage);
      else if (kind === 'video') await trackUpload(file, addVideo);
      else showToast(`${file.name} isn't a supported image or video file`);
    }
  };

  return (
    <DialogShell title="Add content" onClose={onClose}>
      <p className="dialog-body" style={{ margin: 0 }}>
        Uploads straight to your library — assign it to a schedule afterward from the Library or Schedule tab.
      </p>
      <input
        ref={dropzoneInputRef}
        type="file"
        // Explicit video extensions alongside the wildcards — see LibraryScreen.tsx's
        // own dropzone input for why some containers need this to even be selectable.
        accept="image/*,video/*,.mp4,.mov,.m4v,.avi,.mkv,.webm,.wmv,.flv,.3gp,.mpeg,.mpg,.ts,.ogv"
        multiple
        hidden
        onChange={(e) => {
          void handleDropped(e.target.files);
          e.target.value = '';
        }}
      />
      <input
        ref={pdfInputRef}
        type="file"
        accept="application/pdf"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void trackUpload(file, addPdf);
          e.target.value = '';
        }}
      />
      <input
        ref={pptxInputRef}
        type="file"
        accept=".ppt,.pptx,application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.presentationml.presentation"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void trackUpload(file, addPptx);
          e.target.value = '';
        }}
      />
      <div
        className="card"
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
      <button type="button" className="btn btn-secondary btn-block" onClick={() => pdfInputRef.current?.click()}>
        <Icon name="fileText" size={14} /> Upload a PDF
      </button>
      <button type="button" className="btn btn-secondary btn-block" onClick={() => pptxInputRef.current?.click()}>
        <Icon name="fileText" size={14} /> Upload a PowerPoint
      </button>
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
      <div className="dialog-actions">
        <button type="button" className="btn btn-secondary" onClick={onClose}>Done</button>
      </div>
    </DialogShell>
  );
}
