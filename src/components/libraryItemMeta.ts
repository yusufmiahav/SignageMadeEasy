import type { IconName } from './icons/Icon';
import type { LibraryItem } from '../api/types';

// Shared by LibraryCard.tsx (grid view) and LibraryTreeView.tsx (tree view) so both
// render the exact same icon/label per type — kept in its own file rather than
// exported from LibraryCard.tsx so that file stays component-only.
export const TYPE_ICON: Record<LibraryItem['type'], IconName> = {
  image: 'image',
  video: 'video',
  pdf: 'fileText',
  announcement: 'messageCircle',
  clock: 'clock',
  ndi: 'radio',
  'tfl-status': 'activity',
  'tfl-arrivals': 'train',
};

export const TYPE_LABEL: Record<LibraryItem['type'], string> = {
  image: 'Image',
  video: 'Video',
  pdf: 'PDF',
  announcement: 'Announcement',
  clock: 'Clock',
  ndi: 'NDI source',
  'tfl-status': 'TfL status',
  'tfl-arrivals': 'TfL arrivals',
};

// Kept in sync by hand with AddTflStatusDialog.tsx's MODES.
const TFL_MODE_LABEL: Record<string, string> = {
  tube: 'Underground', overground: 'Overground', dlr: 'DLR', 'elizabeth-line': 'Elizabeth line',
};

/** One-line type-specific summary — same text LibraryCard/LibraryTreeView/ItemInspectorPanel all show under an item's name. */
export function metaText(item: LibraryItem): string {
  switch (item.type) {
    case 'image':
      return item.size ?? '';
    case 'video':
      return [item.duration, item.size].filter(Boolean).join(' · ');
    case 'pdf':
      return item.size ?? '';
    case 'announcement':
      return item.text ?? '';
    case 'clock':
      return 'Live time of day';
    case 'ndi':
      return item.ndiSourceName ?? '';
    case 'tfl-status':
      return (item.tflModes ?? []).map((m) => TFL_MODE_LABEL[m] ?? m).join(', ');
    case 'tfl-arrivals':
      return (item.tflStations ?? []).map((s) => s.stopPointName).join(', ');
  }
}

// Announcements and clocks have no underlying file — nothing to download for
// those. Video downloads the original upload (fullUrl), not whichever capped/full
// copy a given screen happens to be playing, since "download the uploaded content"
// means the source file, not a resolution-specific derivative of it.
export function downloadUrlFor(item: LibraryItem): string | undefined {
  if (item.type === 'video') return item.fullUrl ?? item.thumb;
  if (item.type === 'image' || item.type === 'pdf') return item.thumb;
  return undefined;
}
