import type { Group, LibraryItem } from './types';

export interface ActiveContent {
  ids: string[];
  /** "forced" | "event" | "default" */
  kind: 'forced' | 'event' | 'default';
  /** "Forced" | the event's name | "Default playlist" */
  label: string;
}

function toISODate(d: Date): string {
  const pad2 = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/**
 * Resolution order (highest priority first):
 * 1. forcedContentId, if set — that single item, shown until cleared.
 * 2. An event whose date range includes today — that event's item set,
 *    replacing the default playlist entirely for the range.
 * 3. Otherwise the location's defaultPlaylist, looping.
 */
export function activeContentIds(group: Group, today: string = toISODate(new Date())): ActiveContent {
  if (group.forcedContentId) {
    return { ids: [group.forcedContentId], kind: 'forced', label: 'Forced' };
  }
  const event = group.events.find((e) => today >= e.start && today <= e.end);
  if (event) {
    return { ids: event.libIds, kind: 'event', label: event.name };
  }
  return { ids: group.defaultPlaylist, kind: 'default', label: 'Default playlist' };
}

export function nowPlayingName(group: Group, libraryById: Map<string, LibraryItem>): string {
  const { ids } = activeContentIds(group);
  const first = ids.map((id) => libraryById.get(id)).find((item): item is LibraryItem => !!item);
  return first ? first.name : '—';
}

export function itemsForDate(group: Group, date: string): { ids: string[]; kind: 'event' | 'default'; label: string } {
  const event = group.events.find((e) => date >= e.start && date <= e.end);
  if (event) return { ids: event.libIds, kind: 'event', label: event.name };
  return { ids: group.defaultPlaylist, kind: 'default', label: 'Default playlist' };
}
