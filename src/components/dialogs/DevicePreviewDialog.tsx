import { useEffect, useRef, useState } from 'react';
import { DialogShell } from './DialogShell';
import { Icon } from '../icons/Icon';
import type { AppState } from '../../hooks/useAppState';
import type { Device } from '../../api/types';

interface DevicePreviewDialogProps {
  app: AppState;
  device: Device;
  onClose: () => void;
}

export function DevicePreviewDialog({ app, device, onClose }: DevicePreviewDialogProps) {
  const { previewDevice, showToast } = app;
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  // Tracks the current blob: URL outside React state so it can be revoked from the
  // unmount cleanup below without that cleanup itself needing to call setState.
  const imageUrlRef = useRef<string | null>(null);

  const load = () => {
    setLoading(true);
    setFailed(false);
    previewDevice(device.id)
      .then((url) => {
        if (imageUrlRef.current) URL.revokeObjectURL(imageUrlRef.current);
        imageUrlRef.current = url;
        setImageUrl(url);
      })
      .catch((err) => {
        setFailed(true);
        showToast(err instanceof Error ? err.message : 'Could not load preview');
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    return () => {
      if (imageUrlRef.current) URL.revokeObjectURL(imageUrlRef.current);
      imageUrlRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [device.id]);

  return (
    <DialogShell title={`Preview: ${device.name}`} onClose={onClose}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {imageUrl ? (
          <img src={imageUrl} alt={`Live preview of ${device.name}`} style={{ width: '100%', display: 'block', borderRadius: 6 }} />
        ) : (
          <div style={{ textAlign: 'center', padding: '32px 0', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
            <Icon name={failed ? 'monitor' : 'eye'} size={24} />
            <p className="text-muted" style={{ margin: 0 }}>
              {loading ? 'Loading…' : "Couldn't reach this screen."}
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
