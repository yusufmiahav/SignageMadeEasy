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
