import { useState } from 'react';
import { DialogShell } from './DialogShell';
import { Icon } from '../icons/Icon';
import type { AppState } from '../../hooks/useAppState';

type PairMode = 'scan' | 'qr' | 'manual';

interface PairDeviceDialogProps {
  app: AppState;
  onClose: () => void;
}

export function PairDeviceDialog({ app, onClose }: PairDeviceDialogProps) {
  const { groups, addGroup, pairDevice, scanNetwork, showToast } = app;
  const [groupId, setGroupId] = useState(groups[0]?.id ?? '__new__');
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

  const isNewGroup = groupId === '__new__';

  const resolveGroupId = async (): Promise<string> => {
    if (!isNewGroup) return groupId;
    const group = await addGroup(newGroupName);
    return group.id;
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

  const simulateQrScan = () => {
    const ip = `192.168.1.${20 + Math.floor(Math.random() * 200)}`;
    void pairFound({ id: 'qr', name: 'Scanned Display', ip });
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
          <div className="qr-viewfinder">
            <span className="qr-corner tl" />
            <span className="qr-corner tr" />
            <span className="qr-corner bl" />
            <span className="qr-corner br" />
          </div>
          <p className="text-muted" style={{ margin: 0, textAlign: 'center', fontSize: 13 }}>Point your camera at the code shown on the display when it boots.</p>
          <button type="button" className="btn btn-secondary" disabled={pairingIp !== null} onClick={simulateQrScan}>
            {pairingIp !== null ? 'Pairing…' : 'Simulate scan'}
          </button>
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
