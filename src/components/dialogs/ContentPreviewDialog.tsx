import { DialogShell } from './DialogShell';
import { PreviewContent } from '../PreviewContent';
import type { LibraryItem } from '../../api/types';

interface ContentPreviewDialogProps {
  item: LibraryItem;
  onClose: () => void;
}

export function ContentPreviewDialog({ item, onClose }: ContentPreviewDialogProps) {
  return (
    <DialogShell title={`Preview: ${item.name}`} onClose={onClose}>
      <PreviewContent item={item} />
    </DialogShell>
  );
}
