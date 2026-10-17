import { useEffect, useRef, useState } from 'react';
import { DialogShell } from './DialogShell';
import { Icon } from '../icons/Icon';
import { nowPlayingItemForDevice, nowPlayingItemForDeviceInGroup } from '../../api/resolve';
import type { AppState } from '../../hooks/useAppState';
import type { Device } from '../../api/types';

interface DevicePreviewDialogProps {
  app: AppState;
  device: Device;
  onClose: () => void;
}

export function DevicePreviewDialog({ app, device, onClose }: DevicePreviewDialogProps) {
  const { previewDevice, jumpDevicePdfPage, showToast, groups, library } = app;
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  // Set alongside imageUrl when the hub couldn't reach the screen live and fell back
  // to its cached last frame instead (see client.ts's DevicePreview/devices.ts's
  // /:id/preview route) — null while the current image is a live one.
  const [capturedAt, setCapturedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  // Tracks the current blob: URL outside React state so it can be revoked from the
  // unmount cleanup below without that cleanup itself needing to call setState.
  const imageUrlRef = useRef<string | null>(null);

  // Resolves what this device is actually playing right now — same priority logic
  // HomeScreen's own preview thumbnail already uses — just to check whether it's a
  // PDF worth offering a page picker for; this dialog has no other use for it.
  const libraryById = new Map(library.map((item) => [item.id, item]));
  const group = device.groupId ? groups.find((g) => g.id === device.groupId) : undefined;
  const nowPlayingItem = group
    ? nowPlayingItemForDeviceInGroup(device, group, libraryById)
    : nowPlayingItemForDevice(device, libraryById);
  const pdfPageCount = nowPlayingItem?.type === 'pdf' ? nowPlayingItem.pageCount ?? 1 : 0;

  const [jumpPage, setJumpPage] = useState(1);
  const [jumping, setJumping] = useState(false);

  const load = () => {
    setLoading(true);
    setFailed(false);
    previewDevice(device.id)
      .then(({ url, stale, capturedAt: at }) => {
        if (imageUrlRef.current) URL.revokeObjectURL(imageUrlRef.current);
        imageUrlRef.current = url;
        setImageUrl(url);
        setCapturedAt(stale ? at : null);
      })
      .catch((err) => {
        setFailed(true);
        showToast(err instanceof Error ? err.message : 'Could not load preview');
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    setJumpPage(1);
    return () => {
      if (imageUrlRef.current) URL.revokeObjectURL(imageUrlRef.current);
      imageUrlRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [device.id]);

  // The remote equivalent of plugging a USB keyboard into the Pi and using the
  // arrow/PgUp/PgDn keys (see pi-player/public/player.js's jumpToPdfPage) — this
  // hub has no way to know what page a PDF is actually on right now (that's purely
  // the Pi's own ephemeral runtime state, never reported back), so rather than
  // faking a "current page" this just re-fetches the live screenshot a few seconds
  // later, enough time for the Pi's poll (up to 2s) plus a render, so the updated
  // page becomes visible here the same way any other change would.
  const jumpToPage = async () => {
    setJumping(true);
    try {
      await jumpDevicePdfPage(device.id, jumpPage);
      showToast(`Jumping to page ${jumpPage}…`);
      setTimeout(load, 2500);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not jump to that page');
    } finally {
      setJumping(false);
    }
  };

  return (
    <DialogShell title={`Preview: ${device.name}`} onClose={onClose}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {imageUrl ? (
          <>
            {/* maxHeight, not just width: 100% — a portrait-mounted screen's screenshot
                is tall and narrow (see Settings' per-screen orientation setting); without
                a height cap it stretched to the dialog's full width regardless, rendering
                far larger than a preview needs to. Same fix as PreviewContent.tsx's own
                image/video sizing, applied here too since this is a different component
                (a live screenshot, not library content). */}
            <img
              src={imageUrl}
              alt={`${capturedAt ? 'Last-seen' : 'Live'} preview of ${device.name}`}
              style={{ maxWidth: '100%', maxHeight: '60vh', width: 'auto', height: 'auto', display: 'block', margin: '0 auto', borderRadius: 6 }}
            />
            {capturedAt && (
              <div className="dialog-warning">
                <Icon name="alertTriangle" size={16} />
                <span>Couldn't reach this screen just now — showing its last-seen frame, from {new Date(capturedAt).toLocaleString()}.</span>
              </div>
            )}
          </>
        ) : (
          <div style={{ textAlign: 'center', padding: '32px 0', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
            <Icon name={failed ? 'monitor' : 'eye'} size={24} />
            <p className="text-muted" style={{ margin: 0 }}>
              {loading ? 'Loading…' : "Couldn't reach this screen, and it's never been previewed before."}
            </p>
          </div>
        )}
        {pdfPageCount > 1 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, paddingTop: 4, borderTop: '1px solid var(--color-divider)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <label htmlFor="pdf-jump-page" className="text-muted" style={{ fontSize: 12 }}>Jump to page</label>
              <input
                id="pdf-jump-page"
                className="input"
                type="number"
                min={1}
                max={pdfPageCount}
                value={jumpPage}
                onChange={(e) => setJumpPage(Math.min(pdfPageCount, Math.max(1, Math.round(Number(e.target.value)) || 1)))}
                style={{ width: 64 }}
              />
              <span className="text-muted" style={{ fontSize: 12 }}>of {pdfPageCount}</span>
              <button type="button" className="btn btn-secondary" style={{ marginLeft: 'auto' }} disabled={jumping} onClick={() => void jumpToPage()}>
                {jumping ? 'Jumping…' : 'Go'}
              </button>
            </div>
            <p className="text-muted" style={{ fontSize: 11, margin: 0 }}>
              Overrides the automatic rotation until the content here changes — same as a USB keyboard's arrow/PgUp/PgDn keys plugged into the screen.
            </p>
          </div>
        )}
        <button type="button" className="btn btn-secondary" style={{ alignSelf: 'flex-start' }} disabled={loading} onClick={load}>
          <Icon name="eye" size={14} />
          {loading ? 'Loading…' : 'Refresh'}
        </button>
      </div>
    </DialogShell>
  );
}
