// Mirrors ../../hub/src/types.ts's player-facing shapes — kept in sync by hand,
// same reasoning as hub/src/types.ts's own header comment.

export type LibraryItemType = 'image' | 'video' | 'pdf' | 'announcement' | 'clock';

export interface PlayerItem {
  id: string;
  type: LibraryItemType;
  url: string;
  duration: number | null;
  pageCount?: number;
}

export interface PlayerState {
  kind: 'blackout' | 'forced' | 'event' | 'default';
  label: string;
  items: PlayerItem[];
  announcement: { on: boolean; text: string | null };
  /** See hub/src/types.ts's copy of this interface for the full comment. */
  safetyHold: boolean;
}

export interface PairingConfig {
  deviceId: string;
  hubUrl: string;
}
