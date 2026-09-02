import type { Device, Group, LibraryItem } from './types';

export interface ActiveContent {
  ids: string[];
  /** "blackout" | "forced" | "event" | "default" */
  kind: 'blackout' | 'forced' | 'event' | 'default';
  /** "Blackout" | "Forced" | the event's name | "Default playlist" */
  label: string;
}

function toISODate(d: Date): string {
  const pad2 = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/**
 * Resolution order (highest priority first):
 * 1. blackout, if set — every screen at this location goes plain black, above
 *    even forced content (an emergency override).
 * 2. forcedContentId, if set — that single item, shown until cleared.
 * 3. An event whose date range includes today — that event's item set,
 *    replacing the default playlist entirely for the range. If the event also has
 *    a startTime/endTime, it only applies during that daily window; outside it,
 *    the default playlist plays as usual (doesn't support crossing midnight).
 * 4. Otherwise the location's defaultPlaylist, looping.
 */
export function activeContentIds(group: Group, now: Date = new Date()): ActiveContent {
  if (group.blackout) {
    return { ids: [], kind: 'blackout', label: 'Blackout' };
  }
  if (group.forcedContentId) {
    return { ids: [group.forcedContentId], kind: 'forced', label: 'Forced' };
  }
  const today = toISODate(now);
  const hhmm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  const event = group.events.find((e) => {
    if (today < e.start || today > e.end) return false;
    if (e.startTime && e.endTime) return hhmm >= e.startTime && hhmm <= e.endTime;
    return true;
  });
  if (event) {
    return { ids: event.libIds, kind: 'event', label: event.name };
  }
  return { ids: group.defaultPlaylist, kind: 'default', label: 'Default playlist' };
}

function firstResolvedItem(group: Group, libraryById: Map<string, LibraryItem>): LibraryItem | undefined {
  const { ids } = activeContentIds(group);
  return ids.map((id) => libraryById.get(id)).find((item): item is LibraryItem => !!item);
}

export function nowPlayingName(group: Group, libraryById: Map<string, LibraryItem>): string {
  return firstResolvedItem(group, libraryById)?.name ?? '—';
}

/** The actual item currently resolved for this location (for a thumbnail/preview) — undefined if nothing's scheduled. */
export function nowPlayingItem(group: Group, libraryById: Map<string, LibraryItem>): LibraryItem | undefined {
  return firstResolvedItem(group, libraryById);
}

/**
 * A screen with no location has no schedule/default playlist to fall back on —
 * just its own forcedContentId/blackout, the misc-screen equivalents of a
 * location's controls (mirrors hub/src/store.ts's activeContentIdsForDevice).
 */
export function activeContentIdsForDevice(device: Device): ActiveContent {
  if (device.blackout) return { ids: [], kind: 'blackout', label: 'Blackout' };
  if (device.forcedContentId) return { ids: [device.forcedContentId], kind: 'forced', label: 'Forced' };
  return { ids: [], kind: 'default', label: 'No content' };
}

export function nowPlayingItemForDevice(device: Device, libraryById: Map<string, LibraryItem>): LibraryItem | undefined {
  const { ids } = activeContentIdsForDevice(device);
  return ids.map((id) => libraryById.get(id)).find((item): item is LibraryItem => !!item);
}

export function nowPlayingNameForDevice(device: Device, libraryById: Map<string, LibraryItem>): string {
  return nowPlayingItemForDevice(device, libraryById)?.name ?? '—';
}

export function itemsForDate(group: Group, date: string): { ids: string[]; kind: 'event' | 'default'; label: string } {
  const event = group.events.find((e) => date >= e.start && date <= e.end);
  if (event) return { ids: event.libIds, kind: 'event', label: event.name };
  return { ids: group.defaultPlaylist, kind: 'default', label: 'Default playlist' };
}

// Mirrors hub/src/store.ts's activeAnnouncementId exactly — see its comment for the
// resolution order and the "doesn't span midnight" caveat on the time-of-day check.
export function activeAnnouncementId(group: Group, now: Date = new Date()): string | null {
  if (group.forcedAnnouncementId) return group.forcedAnnouncementId;
  const today = toISODate(now);
  const hhmm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  const active = group.announcementSchedules.find(
    (s) => today >= s.startDate && today <= s.endDate && hhmm >= s.startTime && hhmm <= s.endTime,
  );
  return active?.announcementId ?? null;
}
