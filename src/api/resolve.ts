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
 * 1. blackout, if set — every screen in this group goes plain black, above
 *    even forced content (an emergency override).
 * 2. forcedPlaylist, if non-empty — that fixed sequence, shown until cleared
 *    (same per-item duration/looping behavior as defaultPlaylist).
 * 3. An event whose date range includes today — that event's item set,
 *    replacing the default playlist entirely for the range. If the event also has
 *    a startTime/endTime, it only applies during that daily window; outside it,
 *    the default playlist plays as usual (doesn't support crossing midnight).
 * 4. Otherwise the group's defaultPlaylist, looping.
 */
export function activeContentIds(group: Group, now: Date = new Date()): ActiveContent {
  if (group.blackout) {
    return { ids: [], kind: 'blackout', label: 'Blackout' };
  }
  if (group.forcedPlaylist.length > 0) {
    return { ids: group.forcedPlaylist, kind: 'forced', label: 'Forced' };
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

/** A short display label for a forced playlist — the one item's name, or "First item +2 more" once there's more than one, for anywhere space is too tight for the full PlaylistRow list (e.g. Home's group/device header tags). */
export function forcedPlaylistLabel(ids: string[], libraryById: Map<string, LibraryItem>): string {
  const items = ids.map((id) => libraryById.get(id)).filter((item): item is LibraryItem => !!item);
  if (items.length === 0) return '—';
  if (items.length === 1) return items[0].name;
  return `${items[0].name} +${items.length - 1} more`;
}

export function nowPlayingName(group: Group, libraryById: Map<string, LibraryItem>): string {
  return firstResolvedItem(group, libraryById)?.name ?? '—';
}

/** The actual item currently resolved for this group (for a thumbnail/preview) — undefined if nothing's scheduled. */
export function nowPlayingItem(group: Group, libraryById: Map<string, LibraryItem>): LibraryItem | undefined {
  return firstResolvedItem(group, libraryById);
}

/**
 * A device inside a group normally shows exactly what its group resolves to — but
 * its own forcedPlaylist/blackout (same fields activeContentIdsForDevice uses for a
 * standalone screen) take priority when set, letting one screen in a group show
 * something different without pulling it out of the group. Mirrors
 * hub/src/store.ts's identical device-overrides-group priority check — this is what
 * actually gets served to the Pi; this copy exists purely so the control app's own
 * preview/thumbnail for that one card matches instead of showing the group's.
 */
export function activeContentIdsForDeviceInGroup(device: Device, group: Group, now: Date = new Date()): ActiveContent {
  if (device.blackout) return { ids: [], kind: 'blackout', label: 'Blackout' };
  if (device.forcedPlaylist.length > 0) return { ids: device.forcedPlaylist, kind: 'forced', label: 'Forced' };
  return activeContentIds(group, now);
}

function firstResolvedItemForDeviceInGroup(device: Device, group: Group, libraryById: Map<string, LibraryItem>): LibraryItem | undefined {
  const { ids } = activeContentIdsForDeviceInGroup(device, group);
  return ids.map((id) => libraryById.get(id)).find((item): item is LibraryItem => !!item);
}

export function nowPlayingNameForDeviceInGroup(device: Device, group: Group, libraryById: Map<string, LibraryItem>): string {
  return firstResolvedItemForDeviceInGroup(device, group, libraryById)?.name ?? '—';
}

export function nowPlayingItemForDeviceInGroup(device: Device, group: Group, libraryById: Map<string, LibraryItem>): LibraryItem | undefined {
  return firstResolvedItemForDeviceInGroup(device, group, libraryById);
}

/**
 * A screen with no group has no group-level schedule to fall back on, but does have
 * its own — forcedPlaylist/blackout (the standalone-screen equivalents of a
 * group's controls), then its own events/defaultPlaylist, same priority order
 * and time-window matching as activeContentIds above (mirrors
 * hub/src/store.ts's activeContentIdsForDevice).
 */
export function activeContentIdsForDevice(device: Device, now: Date = new Date()): ActiveContent {
  if (device.blackout) return { ids: [], kind: 'blackout', label: 'Blackout' };
  if (device.forcedPlaylist.length > 0) return { ids: device.forcedPlaylist, kind: 'forced', label: 'Forced' };
  const today = toISODate(now);
  const hhmm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  const event = device.events.find((e) => {
    if (today < e.start || today > e.end) return false;
    if (e.startTime && e.endTime) return hhmm >= e.startTime && hhmm <= e.endTime;
    return true;
  });
  if (event) return { ids: event.libIds, kind: 'event', label: event.name };
  if (device.defaultPlaylist.length > 0) return { ids: device.defaultPlaylist, kind: 'default', label: 'Default playlist' };
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

/** Mirrors itemsForDate — see Device.events' comment in types.ts. */
export function itemsForDateForDevice(device: Device, date: string): { ids: string[]; kind: 'event' | 'default'; label: string } {
  const event = device.events.find((e) => date >= e.start && date <= e.end);
  if (event) return { ids: event.libIds, kind: 'event', label: event.name };
  return { ids: device.defaultPlaylist, kind: 'default', label: 'Default playlist' };
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
