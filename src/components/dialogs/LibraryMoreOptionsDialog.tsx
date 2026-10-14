import { DialogShell } from './DialogShell';
import { Icon, type IconName } from '../icons/Icon';

interface LibraryMoreOptionsDialogProps {
  onAddPdf: () => void;
  onAddAnnouncement: () => void;
  onAddClock: () => void;
  onAddNdiSource: () => void;
  onAddTflStatus: () => void;
  onAddTflArrivals: () => void;
  onClose: () => void;
}

// Desktop-only entry point (see LibraryScreen.tsx) — the toolbar used to spell out
// all 8 add actions as separate buttons, which crowded out everything else once
// NDI/TfL/folder support landed. Image, video, and folder stay as their own
// always-visible buttons (the three most common actions); everything less common
// moves behind this "More options" button instead, same icon+label list pattern as
// the mobile Add chooser (LibraryAddChooserDialog.tsx) just scoped to the remaining
// six types.
export function LibraryMoreOptionsDialog({
  onAddPdf, onAddAnnouncement, onAddClock, onAddNdiSource, onAddTflStatus, onAddTflArrivals, onClose,
}: LibraryMoreOptionsDialogProps) {
  const options: { icon: IconName; label: string; onClick: () => void }[] = [
    { icon: 'fileText', label: 'Add PDF', onClick: onAddPdf },
    { icon: 'messageCircle', label: 'Add announcement', onClick: onAddAnnouncement },
    { icon: 'clock', label: 'Add clock', onClick: onAddClock },
    { icon: 'radio', label: 'Add NDI source', onClick: onAddNdiSource },
    { icon: 'activity', label: 'Add TfL status', onClick: onAddTflStatus },
    { icon: 'train', label: 'Add TfL arrivals', onClick: onAddTflArrivals },
  ];

  return (
    <DialogShell title="More options" onClose={onClose}>
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
