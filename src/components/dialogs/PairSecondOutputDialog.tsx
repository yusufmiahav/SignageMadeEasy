import { useState } from 'react';
import { DialogShell } from './DialogShell';
import type { AppState } from '../../hooks/useAppState';
import type { Device } from '../../api/types';

const CUSTOM_HUB_NETWORK = '__custom__';

interface PairSecondOutputDialogProps {
  app: AppState;
  device: Device;
  onClose: () => void;
}

// Much narrower than PairDeviceDialog — the IP is already known (it's the same
// physical unit as `device`), so there's no scan/QR/manual-entry mode to pick. Defaults
// the second output into the same group as the first (the common "duplicate" case this
// feature exists for — see Device.outputIndex/dualOutputCapable in api/types.ts); for
// independent content, pair here then use the new card's own "Move to another group"
// action afterward, same as any other screen.
export function PairSecondOutputDialog({ app, device, onClose }: PairSecondOutputDialogProps) {
  const { pairDevice, showToast, savedHubNetworks } = app;
  const [hubUrl, setHubUrl] = useState(() => window.location.origin);
  const [hubNetworkSelection, setHubNetworkSelection] = useState(() => {
    const match = savedHubNetworks.find((n) => n.url === window.location.origin);
    return match ? match.id : CUSTOM_HUB_NETWORK;
  });
  const [pairing, setPairing] = useState(false);

  const confirm = async () => {
    setPairing(true);
    try {
      await pairDevice({
        name: `${device.name} (Output 2)`,
        ip: device.ip,
        groupId: device.groupId,
        locationId: device.locationId,
        hubUrl: hubUrl.trim() || undefined,
        outputIndex: 2,
      });
      showToast(`Paired ${device.name}'s second output`);
      onClose();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not pair the second output');
    } finally {
      setPairing(false);
    }
  };

  return (
    <DialogShell title="Pair second output" onClose={onClose}>
      <p className="dialog-body" style={{ margin: 0 }}>
        Pairs {device.ip}'s second output as its own screen — same hardware, independent
        content. It starts in {device.groupId ? "this screen's group" : 'no group'}, so it
        shows the same thing as the first output until you move it to a different group (or
        out of one) for something else.
      </p>
      {savedHubNetworks.length > 0 ? (
        <div className="field">
          <label htmlFor="pair2-hub-network">Hub address for this screen</label>
          <select
            className="input"
            id="pair2-hub-network"
            value={hubNetworkSelection}
            onChange={(e) => {
              const value = e.target.value;
              setHubNetworkSelection(value);
              if (value !== CUSTOM_HUB_NETWORK) {
                const network = savedHubNetworks.find((n) => n.id === value);
                if (network) setHubUrl(network.url);
              }
            }}
          >
            {savedHubNetworks.map((n) => (
              <option key={n.id} value={n.id}>{n.name} ({n.url})</option>
            ))}
            <option value={CUSTOM_HUB_NETWORK}>+ Custom address</option>
          </select>
          {hubNetworkSelection === CUSTOM_HUB_NETWORK && (
            <input
              className="input"
              style={{ marginTop: 6 }}
              value={hubUrl}
              onChange={(e) => setHubUrl(e.target.value)}
              placeholder="http://192.168.1.47:4000"
            />
          )}
        </div>
      ) : (
        <div className="field">
          <label htmlFor="pair2-hub-url">Hub address for this screen</label>
          <input className="input" id="pair2-hub-url" value={hubUrl} onChange={(e) => setHubUrl(e.target.value)} />
        </div>
      )}
      <div className="dialog-actions">
        <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
        <button type="button" className="btn btn-primary" disabled={pairing} onClick={() => void confirm()}>
          {pairing ? 'Pairing…' : 'Pair second output'}
        </button>
      </div>
    </DialogShell>
  );
}
