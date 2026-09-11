import { DialogShell } from './DialogShell';
import { Icon, type IconName } from '../icons/Icon';

interface LibraryAddChooserDialogProps {
  onAddVideo: () => void;
  onAddPdf: () => void;
  onAddAnnouncement: () => void;
  onAddClock: () => void;
  onAddNdiSource: () => void;
  onAddTflStatus: () => void;
  onAddTflArrivals: () => void;
  onClose: () => void;
}

// Mobile-only entry point (see LibraryScreen.tsx) — a row of 7 icon-only buttons
// had no room for labels at that width, and on a real phone there was no way to
// tell what each one added without tapping it. One "Add" button opening this
// dialog instead shows every option with its own icon and label, same pattern as
// the Home tab's own AddChooserDialog.
export function LibraryAddChooserDialog({
  onAddVideo, onAddPdf, onAddAnnouncement, onAddClock, onAddNdiSource, onAddTflStatus, onAddTflArrivals, onClose,
}: LibraryAddChooserDialogProps) {
  const options: { icon: IconName; label: string; onClick: () => void }[] = [
    { icon: 'video', label: 'Add video', onClick: onAddVideo },
    { icon: 'fileText', label: 'Add PDF', onClick: onAddPdf },
    { icon: 'messageCircle', label: 'Add announcement', onClick: onAddAnnouncement },
    { icon: 'clock', label: 'Add clock', onClick: onAddClock },
    { icon: 'radio', label: 'Add NDI source', onClick: onAddNdiSource },
    { icon: 'activity', label: 'Add TfL status', onClick: onAddTflStatus },
    { icon: 'train', label: 'Add TfL arrivals', onClick: onAddTflArrivals },
  ];

  return (
    <DialogShell title="Add" onClose={onClose}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {options.map((opt) => (
          <button
            key={opt.label}
            type="button"
            className="btn btn-secondary btn-block"
            style={{ justifyContent: 'flex-start', gap: 10, padding: '14px 12px' }}
            onClick={() => { opt.onClick(); onClose(); }}
          >
            <Icon name={opt.icon} size={16} />
            {opt.label}
          </button>
        ))}
      </div>
    </DialogShell>
  );
}
