import { useState } from 'react';
import { DialogShell } from './DialogShell';
import type { AppState } from '../../hooks/useAppState';

interface AddNdiSourceDialogProps {
  app: AppState;
  onClose: () => void;
}

export function AddNdiSourceDialog({ app, onClose }: AddNdiSourceDialogProps) {
  const { devices, addNdiSource, listNdiSources } = app;
  const [name, setName] = useState('');
  const [ndiSourceName, setNdiSourceName] = useState('');
  const [scanDeviceId, setScanDeviceId] = useState(devices[0]?.id ?? '');
  const [scanning, setScanning] = useState(false);
  const [scanned, setScanned] = useState<string[] | null>(null);

  const scan = async () => {
    if (!scanDeviceId) return;
    setScanning(true);
    setScanned(null);
    try {
      setScanned(await listNdiSources(scanDeviceId));
    } finally {
      setScanning(false);
    }
  };

  const confirm = async () => {
    if (!ndiSourceName.trim()) return;
    await addNdiSource(name, ndiSourceName);
    onClose();
  };

  return (
    <DialogShell title="Add an NDI source" onClose={onClose}>
      <p className="dialog-body" style={{ margin: 0 }}>
        Displays a live NDI video feed (a camera, encoder, or another computer on the
        network) full-screen. Only Pi 4/5 or x86 mini PC/stick screens can receive it —
        the video streams directly from the source to that screen, never through the hub.
      </p>
      <div className="field">
        <label htmlFor="ndi-name">Label (optional)</label>
        <input className="input" id="ndi-name" placeholder="e.g. Lobby camera" value={name} onChange={(e) => setName(e.target.value)} />
      </div>

      {devices.length > 0 && (
        <div className="field">
          <label htmlFor="ndi-scan-device">Scan for sources using</label>
          <div style={{ display: 'flex', gap: 6 }}>
            <select
              className="input"
              id="ndi-scan-device"
              aria-label="Scan for sources using"
              value={scanDeviceId}
              onChange={(e) => setScanDeviceId(e.target.value)}
              style={{ flex: 1 }}
            >
              {devices.map((d) => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
            <button type="button" className="btn btn-secondary" onClick={() => void scan()} disabled={scanning || !scanDeviceId}>
              {scanning ? 'Scanning…' : 'Scan for sources'}
            </button>
          </div>
        </div>
      )}

      {scanned != null && (
        <div className="field">
          {scanned.length > 0 ? (
            <>
              <label htmlFor="ndi-scanned">Discovered sources</label>
              <select
                className="input"
                id="ndi-scanned"
                aria-label="Discovered sources"
                value=""
                onChange={(e) => { if (e.target.value) setNdiSourceName(e.target.value); }}
              >
                <option value="" disabled>Choose a discovered source…</option>
                {scanned.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </>
          ) : (
            <p className="dialog-body" style={{ margin: 0 }}>
              No sources found — the screen may be unreachable, not NDI-capable (a Pi 3B+
              can't receive NDI), or have no NDI sources currently broadcasting on the
              network. Enter the source name manually below instead.
            </p>
          )}
        </div>
      )}

      <div className="field">
        <label htmlFor="ndi-source-name">NDI source name</label>
        <input
          className="input"
          id="ndi-source-name"
          placeholder="e.g. DESKTOP-ABC (Camera 1)"
          value={ndiSourceName}
          onChange={(e) => setNdiSourceName(e.target.value)}
        />
      </div>
      <div className="dialog-actions">
        <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
        <button type="button" className="btn btn-primary" onClick={() => void confirm()}>Add</button>
      </div>
    </DialogShell>
  );
}
