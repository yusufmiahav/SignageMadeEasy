// Mirrors ../../hub/src/types.ts's player-facing shapes — kept in sync by hand,
// same reasoning as hub/src/types.ts's own header comment.

export type LibraryItemType = 'image' | 'video' | 'pdf' | 'announcement' | 'clock' | 'ndi' | 'tfl-status' | 'tfl-arrivals';

export interface PlayerItem {
  id: string;
  type: LibraryItemType;
  url: string;
  duration: number | null;
  pageCount?: number;
  /** NDI sources only — see hub/src/types.ts's PlayerItem.ndiSourceName. */
  ndiSourceName?: string;
  /** 'tfl-status' items only — see hub/src/types.ts's PlayerItem.tflLines. */
  tflLines?: { id: string; name: string; modeName: string; statusSeverityDescription: string; reason?: string }[];
  /** 'tfl-arrivals' items only — see hub/src/types.ts's PlayerItem.tflArrivalBoards. */
  tflArrivalBoards?: { lineId: string; lineName: string; platformName: string; towards: string; arrivalsSec: number[] }[];
}

export interface PlayerState {
  kind: 'blackout' | 'forced' | 'event' | 'default';
  label: string;
  items: PlayerItem[];
  announcement: { on: boolean; text: string | null };
  /** See hub/src/types.ts's copy of this interface for the full comment. */
  safetyHold: boolean;
  /** See hub/src/types.ts's Device.orientation — applied via displayOrientation.ts. */
  orientation: 'landscape' | 'portrait';
}

export interface PairingConfig {
  deviceId: string;
  hubUrl: string;
}
