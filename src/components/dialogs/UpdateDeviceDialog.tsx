import { DialogShell } from './DialogShell';
import { Icon } from '../icons/Icon';
import type { AppState } from '../../hooks/useAppState';
import type { Device } from '../../api/types';

interface UpdateDeviceDialogProps {
  app: AppState;
  device: Device;
  onClose: () => void;
}

export function UpdateDeviceDialog({ app, device, onClose }: UpdateDeviceDialogProps) {
  const { updateDevice, reprovisionDevice } = app;

  return (
    <DialogShell title={`Update: ${device.name}`} onClose={onClose}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div>
          <button
            type="button"
            className="btn btn-secondary btn-block"
            style={{ justifyContent: 'flex-start', gap: 10, padding: '14px 12px' }}
            onClick={() => { void updateDevice(device); onClose(); }}
          >
            <Icon name="download" size={16} />
            Update
          </button>
          <p className="text-muted" style={{ fontSize: 12, margin: '6px 0 0' }}>
            Pulls the latest player code, rebuilds, and restarts the player process
            on this screen (~10-30s). Covers routine app updates — try this first.
          </p>
        </div>
        <div>
          <button
            type="button"
            className="btn btn-secondary btn-block"
            style={{ justifyContent: 'flex-start', gap: 10, padding: '14px 12px' }}
            onClick={() => { void reprovisionDevice(device); onClose(); }}
          >
            <Icon name="restart" size={16} />
            Re-provision
          </button>
          <p className="text-muted" style={{ fontSize: 12, margin: '6px 0 0' }}>
            Re-runs the entire provisioning script fresh from GitHub and reboots —
            system packages, boot config, and systemd units, not just the app.
            Slower and briefly blanks the screen; only needed for a rare
            system-level change Update above can't cover.
          </p>
        </div>
      </div>
    </DialogShell>
  );
}
