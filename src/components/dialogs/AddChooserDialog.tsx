import { DialogShell } from './DialogShell';
import { Icon } from '../icons/Icon';

interface AddChooserDialogProps {
  onChooseScreen: () => void;
  onChooseLocation: () => void;
  onClose: () => void;
}

export function AddChooserDialog({ onChooseScreen, onChooseLocation, onClose }: AddChooserDialogProps) {
  return (
    <DialogShell title="Add" onClose={onClose}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <button
          type="button"
          className="btn btn-secondary btn-block"
          style={{ justifyContent: 'flex-start', gap: 10, padding: '14px 12px' }}
          onClick={onChooseScreen}
        >
          <Icon name="monitor" size={16} />
          Add a screen
        </button>
        <button
          type="button"
          className="btn btn-secondary btn-block"
          style={{ justifyContent: 'flex-start', gap: 10, padding: '14px 12px' }}
          onClick={onChooseLocation}
        >
          <Icon name="mapPin" size={16} />
          Add a location
        </button>
      </div>
    </DialogShell>
  );
}
