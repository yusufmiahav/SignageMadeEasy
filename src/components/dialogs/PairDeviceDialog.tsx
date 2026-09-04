import { useRef, useState } from 'react';
import { DialogShell } from './DialogShell';
import { Icon } from '../icons/Icon';
import { QrScanner } from '../QrScanner';
import type { AppState } from '../../hooks/useAppState';

type PairMode = 'scan' | 'qr' | 'manual';

const NO_LOCATION = '__none__';
const LAST_LOCATION_KEY = 'signagemadeeasy.lastPairLocation';

function lastPairedLocation(): string {
  try {
    return localStorage.getItem(LAST_LOCATION_KEY) ?? NO_LOCATION;
  } catch {
    return NO_LOCATION;
  }
}

function rememberPairedLocation(groupId: string): void {
  try {
    localStorage.setItem(LAST_LOCATION_KEY, groupId);
  } catch {
    // Best-effort — next pairing just won't default to this choice.
  }
}

interface PairDeviceDialogProps {
  app: AppState;
  onClose: () => void;
}

export function PairDeviceDialog({ app, onClose }: PairDeviceDialogProps) {
  const { groups, addGroup, pairDevice, scanNetwork, showToast } = app;
  // Remembers whatever was picked last time (including "no location") rather than
  // always defaulting to the first location — a location shouldn't be forced on a
  // screen just because it's the first one in the list; "no location, assign later"
  // is the actual default until someone chooses something else.
  const [groupId, setGroupId] = useState(() => {
    const last = lastPairedLocation();
    return last === NO_LOCATION || groups.some((g) => g.id === last) ? last : NO_LOCATION;
  });
  const [newGroupName, setNewGroupName] = useState('');
  const [mode, setMode] = useState<PairMode>('scan');
  const [scanning, setScanning] = useState(false);
  const [discovered, setDiscovered] = useState<{ id: string; name: string; ip: string }[]>([]);
  const [manualIp, setManualIp] = useState('');
  // Pairing can take a few seconds when the target IP is unreachable (the hub's own
  // identify() call waits out a timeout before giving up and pairing offline — see
  // hub/src/piAgent.ts) - most noticeable trying to pair a screen on a separate,
  // unroutable IP network. Without this the button just sits there with no feedback,
  // which reads as the UI having hung rather than as a normal, if slow, wait.
  const [pairingIp, setPairingIp] = useState<string | null>(null);
  // QrScanner calls onScan on every frame the code is still in view, not just once —
  // this ref (synchronous, unlike the pairingIp state) stops a burst of frames
  // decoded before the first pairFound() call's state update lands from firing
  // pairDevice() more than once for the same scan.
  const qrScanLockRef = useRef(false);

  const isNewGroup = groupId === '__new__';

  const resolveGroupId = async (): Promise<string | null> => {
    if (isNewGroup) {
      const group = await addGroup(newGroupName);
      rememberPairedLocation(group.id);
      return group.id;
    }
    rememberPairedLocation(groupId);
    return groupId === NO_LOCATION ? null : groupId;
  };

  const changeMode = (m: PairMode) => {
    setMode(m);
    setDiscovered([]);
    setScanning(false);
  };

  const startScan = () => {
    setScanning(true);
    setDiscovered([]);
    scanNetwork().then((found) => {
      setScanning(false);
      setDiscovered(found);
    });
  };

  const pairFound = async (found: { id: string; name: string; ip: string }) => {
    setPairingIp(found.ip);
    try {
      const gid = await resolveGroupId();
      await pairDevice({ name: found.name, ip: found.ip, groupId: gid });
      showToast(`Paired ${found.name}`);
      onClose();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not pair that display');
    } finally {
      setPairingIp(null);
    }
  };

  const handleQrScan = (ip: string) => {
    if (qrScanLockRef.current) return;
    qrScanLockRef.current = true;
    void pairFound({ id: 'qr', name: 'Scanned Display', ip }).finally(() => {
      qrScanLockRef.current = false;
    });
  };

  const connectManual = async () => {
    if (!manualIp) return;
    setPairingIp(manualIp);
    try {
      const gid = await resolveGroupId();
      await pairDevice({ name: 'Display', ip: manualIp, groupId: gid });
      showToast(`Connected to ${manualIp}`);
      onClose();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not pair that display');
    } finally {
      setPairingIp(null);
    }
  };

  return (
    <DialogShell title="Add a screen" onClose={onClose}>
      <div className="field">
        <label htmlFor="pair-location">Location</label>
        <select className="input" id="pair-location" value={groupId} onChange={(e) => setGroupId(e.target.value)}>
          <option value={NO_LOCATION}>No location (can be assigned later)</option>
          {groups.map((g) => (
            <option key={g.id} value={g.id}>{g.name}</option>
          ))}
          <option value="__new__">+ New location</option>
        </select>
      </div>
      {isNewGroup && (
        <div className="field">
          <label htmlFor="new-loc-name">New location name</label>
          <input className="input" id="new-loc-name" placeholder="e.g. Reception" value={newGroupName} onChange={(e) => setNewGroupName(e.target.value)} />
        </div>
      )}

      <div className="seg" style={{ alignSelf: 'flex-start', flexWrap: 'wrap' }}>
        <label className="seg-opt"><input type="radio" name="pairMode" checked={mode === 'scan'} onChange={() => changeMode('scan')} />Scan network</label>
        <label className="seg-opt"><input type="radio" name="pairMode" checked={mode === 'qr'} onChange={() => changeMode('qr')} />Scan QR code</label>
        <label className="seg-opt"><input type="radio" name="pairMode" checked={mode === 'manual'} onChange={() => changeMode('manual')} />Enter IP</label>
      </div>

      {mode === 'scan' && !scanning && discovered.length === 0 && (
        <div style={{ textAlign: 'center', padding: '16px 0', display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'center' }}>
          <Icon name="search" size={24} />
          <p className="dialog-body" style={{ margin: 0 }}>Look for signage-ready displays on this Wi-Fi network.</p>
          <button type="button" className="btn btn-primary" onClick={startScan}>Scan network</button>
        </div>
      )}
      {mode === 'scan' && scanning && (
        <div style={{ textAlign: 'center', padding: '20px 0', display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'center' }}>
          <div className="scan-pulse" />
          <p className="text-muted" style={{ margin: 0 }}>Searching 192.168.1.0/24…</p>
        </div>
      )}
      {mode === 'scan' && !scanning && discovered.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {discovered.map((found) => (
            <div key={found.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--color-divider)' }}>
              <div>
                <div style={{ fontWeight: 600, fontSize: 13 }}>{found.name}</div>
                <div className="text-muted" style={{ fontSize: 12 }}>{found.ip}</div>
              </div>
              <button type="button" className="btn btn-secondary" disabled={pairingIp === found.ip} onClick={() => void pairFound(found)}>
                {pairingIp === found.ip ? 'Pairing…' : 'Pair'}
              </button>
            </div>
          ))}
          <button type="button" className="btn btn-ghost" style={{ alignSelf: 'flex-start', marginTop: 6 }} onClick={startScan}>Scan again</button>
        </div>
      )}

      {mode === 'qr' && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, padding: '6px 0' }}>
          <QrScanner onScan={handleQrScan} />
          <p className="text-muted" style={{ margin: 0, textAlign: 'center', fontSize: 13 }}>
            {pairingIp !== null ? 'Pairing…' : 'Point your camera at the code shown on the display when it boots.'}
          </p>
        </div>
      )}

      {mode === 'manual' && (
        <>
          <div className="field">
            <label htmlFor="manual-ip">Display IP address</label>
            <input className="input" id="manual-ip" placeholder="192.168.1.42" value={manualIp} onChange={(e) => setManualIp(e.target.value)} />
          </div>
          <button type="button" className="btn btn-primary btn-block" disabled={pairingIp === manualIp && pairingIp !== null} onClick={() => void connectManual()}>
            {pairingIp === manualIp && pairingIp !== null ? 'Connecting…' : 'Connect'}
          </button>
          <p className="text-muted" style={{ fontSize: 12, margin: 0 }}>
            This IP is shown on the display's screen right after it boots.
            {pairingIp === manualIp && pairingIp !== null && ' Trying to reach it now — this can take a few seconds if it\'s unreachable.'}
          </p>
        </>
      )}
    </DialogShell>
  );
}
