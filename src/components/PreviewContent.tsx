import { useEffect, useState } from 'react';
import type { LibraryItem } from '../api/types';

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

interface PreviewContentProps {
  item: LibraryItem;
  /** Videos autoplay by default (dialog use) — the inline inspector panel passes false so opening an item doesn't blast audio/video immediately. */
  autoPlay?: boolean;
}

// A rough approximation of how this item actually renders on a Pi (see
// pi-player/public/player.js) — good enough to confirm "is this the right file /
// does it look right" without needing a paired screen to check on. Shared by
// ContentPreviewDialog (the existing quick-preview popup) and ItemInspectorPanel
// (the Library tree view's inline split panel) so the per-type rendering logic
// lives in exactly one place.
export function PreviewContent({ item, autoPlay = true }: PreviewContentProps) {
  return (
    <div style={{ maxHeight: '70vh', overflow: 'auto' }}>
      {item.type === 'image' && item.thumb && (
        <img src={item.thumb} alt={item.name} style={{ width: '100%', display: 'block' }} />
      )}
      {item.type === 'video' && (item.fullUrl ?? item.thumb) && (
        // The original upload, not whichever capped/full copy a given screen
        // happens to be playing — this is a content check, not a per-screen one.
        <video src={item.fullUrl ?? item.thumb} controls autoPlay={autoPlay} style={{ width: '100%', display: 'block' }} />
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
      {item.type === 'tfl-status' && (
        <div style={{ background: '#000', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', aspectRatio: '16 / 9', padding: 16, textAlign: 'center' }}>
          <span style={{ fontSize: 14, opacity: 0.7 }}>
            Live TfL status board ({(item.tflModes ?? []).join(', ') || 'no modes set'}) — the
            hub resolves current line status at playback time, not previewable here.
          </span>
        </div>
      )}
      {item.type === 'tfl-arrivals' && (
        <div style={{ background: '#000', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', aspectRatio: '16 / 9', padding: 16, textAlign: 'center' }}>
          <span style={{ fontSize: 14, opacity: 0.7 }}>
            Live TfL arrivals board ({(item.tflStations ?? []).map((s) => s.stopPointName).join(', ') || 'no station set'}) — the hub
            resolves current train times at playback time, not previewable here.
          </span>
        </div>
      )}
      {item.type === 'announcement' && (
        <div style={{ background: '#000', color: '#fff', padding: '24px 16px', textAlign: 'center', fontSize: 16, fontWeight: 600 }}>
          {item.text || 'Announcement'}
        </div>
      )}
    </div>
  );
}
