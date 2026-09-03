import { useEffect, useState } from 'react';
import { DialogShell } from './DialogShell';
import type { LibraryItem } from '../../api/types';

function LiveClock() {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return (
    <div style={{ background: '#000', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', aspectRatio: '16 / 9' }}>
      <span style={{ fontSize: 48, fontFamily: 'system-ui, sans-serif' }}>{now.toLocaleTimeString()}</span>
    </div>
  );
}

interface ContentPreviewDialogProps {
  item: LibraryItem;
  onClose: () => void;
}

// A rough approximation of how this item actually renders on a Pi (see
// pi-player/public/player.js) — good enough to confirm "is this the right file /
// does it look right" without needing a paired screen to check on.
export function ContentPreviewDialog({ item, onClose }: ContentPreviewDialogProps) {
  return (
    <DialogShell title={`Preview: ${item.name}`} onClose={onClose}>
      <div style={{ maxHeight: '70vh', overflow: 'auto' }}>
        {item.type === 'image' && item.thumb && (
          <img src={item.thumb} alt={item.name} style={{ width: '100%', display: 'block' }} />
        )}
        {item.type === 'video' && (item.fullUrl ?? item.thumb) && (
          // The original upload, not whichever capped/full copy a given screen
          // happens to be playing — this is a content check, not a per-screen one.
          <video src={item.fullUrl ?? item.thumb} controls autoPlay style={{ width: '100%', display: 'block' }} />
        )}
        {item.type === 'pdf' && item.thumb && (
          <iframe src={item.thumb} title={item.name} style={{ width: '100%', height: '70vh', border: 'none' }} />
        )}
        {item.type === 'clock' && <LiveClock />}
        {item.type === 'ndi' && (
          <div style={{ background: '#000', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', aspectRatio: '16 / 9', padding: 16, textAlign: 'center' }}>
            <span style={{ fontSize: 14, opacity: 0.7 }}>
              Live NDI feed ({item.ndiSourceName || 'no source set'}) — streams directly
              to the screen, not previewable here.
            </span>
          </div>
        )}
        {item.type === 'announcement' && (
          <div style={{ background: '#000', color: '#fff', padding: '24px 16px', textAlign: 'center', fontSize: 16, fontWeight: 600 }}>
            {item.text || 'Announcement'}
          </div>
        )}
      </div>
    </DialogShell>
  );
}
