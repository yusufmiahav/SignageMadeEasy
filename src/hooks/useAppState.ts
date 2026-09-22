import { useCallback, useEffect, useRef, useState } from 'react';
import { api, type DiscoveredDevice } from '../api/client';
import type { AnnouncementSchedule, Backup, Device, DeviceStatus, Folder, Group, LibraryItem, Location, ScheduleEvent, TflStationConfig } from '../api/types';

export function useAppState() {
  const [library, setLibrary] = useState<LibraryItem[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [devices, setDevices] = useState<Device[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  // Defaults true (see hub/src/store.ts's getSafetyHold) — matches this project's
  // original always-on behavior until the initial load below overwrites it with the
  // hub's real value.
  const [safetyHold, setSafetyHoldState] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [toast, setToast] = useState('');
  const toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const showToast = useCallback((message: string) => {
    clearTimeout(toastTimer.current);
    setToast(message);
    toastTimer.current = setTimeout(() => setToast(''), 2600);
  }, []);

  const refreshLibrary = useCallback(async () => setLibrary(await api.listLibrary()), []);
  const refreshGroups = useCallback(async () => setGroups(await api.listGroups()), []);
  const refreshFolders = useCallback(async () => setFolders(await api.listFolders()), []);
  const refreshLocations = useCallback(async () => setLocations(await api.listLocations()), []);

  // Tracks each device's last-known status across polls (not React state — this
  // must never itself trigger a render) purely to detect an online->offline
  // transition below; a device that's simply always been offline (never seen
  // online by this tab) or one seen for the first time on this poll doesn't fire,
  // so pairing a new not-yet-heartbeated screen doesn't spam this on load.
  const prevDeviceStatus = useRef<Map<string, DeviceStatus>>(new Map());
  const isFirstDevicePoll = useRef(true);

  const refreshDevices = useCallback(async () => {
    const next = await api.listDevices();
    if (!isFirstDevicePoll.current) {
      for (const d of next) {
        if (prevDeviceStatus.current.get(d.id) === 'online' && d.status === 'offline') {
          showToast(`${d.name} went offline`);
        }
      }
    }
    isFirstDevicePoll.current = false;
    prevDeviceStatus.current = new Map(next.map((d) => [d.id, d.status]));
    setDevices(next);
  }, [showToast]);

  const refreshSettings = useCallback(async () => setSafetyHoldState((await api.getSettings()).safetyHold), []);

  const setSafetyHold = useCallback(async (enabled: boolean) => {
    await api.setSafetyHold(enabled);
    setSafetyHoldState(enabled);
    showToast(enabled ? 'Safety hold enabled' : 'Safety hold disabled');
  }, [showToast]);

  useEffect(() => {
    (async () => {
      await Promise.all([refreshLibrary(), refreshGroups(), refreshDevices(), refreshSettings(), refreshFolders(), refreshLocations()]);
      setLoaded(true);
    })();
  }, [refreshLibrary, refreshGroups, refreshDevices, refreshSettings, refreshFolders, refreshLocations]);

  // Device online/offline status (and group-level forced/scheduled announcement
  // state) can change on their own with nobody touching the control app - a screen
  // going offline, or a schedule's start/end time passing - so the one-time load
  // above isn't enough; without this, the UI only ever catches up on those after
  // some unrelated action happens to trigger its own refreshDevices()/refreshGroups()
  // call, or the page is manually reloaded. 4s keeps total worst-case lag (this poll
  // plus the hub's own 12s online/offline window — see ONLINE_WINDOW_MS) close to the
  // Pi's 5s heartbeat interval instead of compounding into tens of seconds.
  // Also picks up a video's transcodeStatus flipping from 'processing' to 'done'/'failed'
  // once the hub's background capping job finishes (see hub/src/routes/library.ts) —
  // otherwise the Library screen's "Decoding…" badge would only ever clear on some
  // unrelated action that happens to trigger its own refreshLibrary() call.
  useEffect(() => {
    const id = setInterval(() => {
      void refreshDevices();
      void refreshGroups();
      void refreshLibrary();
      void refreshFolders();
      void refreshLocations();
    }, 4_000);
    return () => clearInterval(id);
  }, [refreshDevices, refreshGroups, refreshLibrary, refreshFolders, refreshLocations]);

  // ---- Library ----
  const addImage = useCallback(async (file: File, onProgress?: (pct: number) => void) => {
    const item = await api.addImage(file, onProgress);
    await refreshLibrary();
    showToast(`${item.name} added`);
    return item;
  }, [refreshLibrary, showToast]);

  const addVideo = useCallback(async (file: File, onProgress?: (pct: number) => void) => {
    const item = await api.addVideo(file, onProgress);
    await refreshLibrary();
    showToast(`${item.name} added`);
    return item;
  }, [refreshLibrary, showToast]);

  const addPdf = useCallback(async (file: File, onProgress?: (pct: number) => void) => {
    const item = await api.addPdf(file, onProgress);
    await refreshLibrary();
    showToast(`${item.name} added`);
    return item;
  }, [refreshLibrary, showToast]);

  const addAnnouncement = useCallback(async (name: string, text: string) => {
    const item = await api.addAnnouncement(name, text);
    await refreshLibrary();
    showToast('Announcement added');
    return item;
  }, [refreshLibrary, showToast]);

  const addClock = useCallback(async (name: string) => {
    const item = await api.addClock(name);
    await refreshLibrary();
    showToast('Clock added');
    return item;
  }, [refreshLibrary, showToast]);

  const addNdiSource = useCallback(async (name: string, ndiSourceName: string) => {
    const item = await api.addNdiSource(name, ndiSourceName);
    await refreshLibrary();
    showToast('NDI source added');
    return item;
  }, [refreshLibrary, showToast]);

  // Just a passthrough to the picker dialog — no app state to refresh, unlike the
  // add* callbacks above.
  const listNdiSources = useCallback((deviceId: string) => api.listNdiSources(deviceId), []);

  const setNdiSourceName = useCallback(async (id: string, ndiSourceName: string) => {
    await api.setNdiSourceName(id, ndiSourceName);
    await refreshLibrary();
    showToast('NDI source updated');
  }, [refreshLibrary, showToast]);

  const addTflStatus = useCallback(async (name: string, tflModes: string[]) => {
    const item = await api.addTflStatus(name, tflModes);
    await refreshLibrary();
    showToast('TfL status board added');
    return item;
  }, [refreshLibrary, showToast]);

  // Just a passthrough to AddTflArrivalsDialog's search box — no app state to
  // refresh, same reasoning as listNdiSources above.
  const searchTflStations = useCallback((query: string) => api.searchTflStations(query), []);

  const addTflArrivals = useCallback(async (name: string, tflStations: TflStationConfig[]) => {
    const item = await api.addTflArrivals(name, tflStations);
    await refreshLibrary();
    showToast('TfL arrivals board added');
    return item;
  }, [refreshLibrary, showToast]);

  const setTflModes = useCallback(async (id: string, tflModes: string[]) => {
    await api.setTflModes(id, tflModes);
    await refreshLibrary();
    showToast('TfL status board updated');
  }, [refreshLibrary, showToast]);

  const setTflStations = useCallback(async (id: string, tflStations: TflStationConfig[]) => {
    await api.setTflStations(id, tflStations);
    await refreshLibrary();
    showToast('TfL arrivals board updated');
  }, [refreshLibrary, showToast]);

  const setItemDuration = useCallback(async (id: string, durationSec: number) => {
    await api.setItemDuration(id, durationSec);
    await refreshLibrary();
  }, [refreshLibrary]);

  const renameLibraryItem = useCallback(async (id: string, name: string) => {
    await api.renameLibraryItem(id, name);
    await refreshLibrary();
  }, [refreshLibrary]);

  const reorderLibrary = useCallback(async (ids: string[]) => {
    await api.reorderLibrary(ids);
    await refreshLibrary();
  }, [refreshLibrary]);

  const setLibraryItemTags = useCallback(async (id: string, tags: string[]) => {
    await api.setLibraryItemTags(id, tags);
    await refreshLibrary();
  }, [refreshLibrary]);

  const setLibraryItemFolder = useCallback(async (id: string, folderId: string | null) => {
    await api.setLibraryItemFolder(id, folderId);
    await refreshLibrary();
  }, [refreshLibrary]);

  const removeLibraryItem = useCallback(async (id: string) => {
    await api.removeLibraryItem(id);
    await Promise.all([refreshLibrary(), refreshGroups(), refreshDevices()]);
  }, [refreshLibrary, refreshGroups, refreshDevices]);

  // Bulk delete from the Library screen's multi-select mode — one refresh at the end
  // rather than one per item, same reasoning as forceContentAllScreens's loop below.
  const removeLibraryItems = useCallback(async (ids: string[]) => {
    await Promise.all(ids.map((id) => api.removeLibraryItem(id)));
    await Promise.all([refreshLibrary(), refreshGroups(), refreshDevices()]);
    showToast(`${ids.length} item${ids.length === 1 ? '' : 's'} deleted`);
  }, [refreshLibrary, refreshGroups, refreshDevices, showToast]);

  // ---- Folders (Library screen media organization) ----
  const addFolder = useCallback(async (name: string, parentId: string | null) => {
    const folder = await api.addFolder(name, parentId);
    await refreshFolders();
    return folder;
  }, [refreshFolders]);

  const renameFolder = useCallback(async (id: string, name: string) => {
    await api.renameFolder(id, name);
    await refreshFolders();
  }, [refreshFolders]);

  const moveFolder = useCallback(async (id: string, parentId: string | null) => {
    await api.moveFolder(id, parentId);
    await refreshFolders();
  }, [refreshFolders]);

  const removeFolder = useCallback(async (id: string) => {
    await api.removeFolder(id);
    await Promise.all([refreshFolders(), refreshLibrary()]);
    showToast('Folder deleted — contents moved up a level');
  }, [refreshFolders, refreshLibrary, showToast]);

  // ---- Locations ----
  const addLocation = useCallback(async (name: string) => {
    const location = await api.addLocation(name);
    await refreshLocations();
    return location;
  }, [refreshLocations]);

  const renameLocation = useCallback(async (id: string, name: string) => {
    await api.renameLocation(id, name);
    await refreshLocations();
  }, [refreshLocations]);

  const deleteLocation = useCallback(async (id: string) => {
    await api.deleteLocation(id);
    await Promise.all([refreshLocations(), refreshGroups(), refreshDevices()]);
  }, [refreshLocations, refreshGroups, refreshDevices]);

  const reorderLocations = useCallback(async (ids: string[]) => {
    await api.reorderLocations(ids);
    await refreshLocations();
  }, [refreshLocations]);

  // ---- Groups ----
  const addGroup = useCallback(async (name: string, locationId?: string | null) => {
    const group = await api.addGroup(name, locationId);
    await refreshGroups();
    return group;
  }, [refreshGroups]);

  const renameGroup = useCallback(async (id: string, name: string) => {
    await api.renameGroup(id, name);
    await refreshGroups();
  }, [refreshGroups]);

  const setGroupLocation = useCallback(async (id: string, locationId: string | null) => {
    await api.setGroupLocation(id, locationId);
    await refreshGroups();
  }, [refreshGroups]);

  const deleteGroup = useCallback(async (id: string) => {
    const ok = await api.deleteGroup(id);
    if (ok) await refreshGroups();
    return ok;
  }, [refreshGroups]);

  const reorderGroups = useCallback(async (ids: string[]) => {
    await api.reorderGroups(ids);
    await refreshGroups();
  }, [refreshGroups]);

  const addToDefaultPlaylist = useCallback(async (groupId: string, libIds: string[]) => {
    await api.addToDefaultPlaylist(groupId, libIds);
    await refreshGroups();
  }, [refreshGroups]);

  const removeFromDefaultPlaylist = useCallback(async (groupId: string, libId: string) => {
    await api.removeFromDefaultPlaylist(groupId, libId);
    await refreshGroups();
  }, [refreshGroups]);

  const reorderDefaultPlaylist = useCallback(async (groupId: string, libId: string, direction: 'up' | 'down') => {
    await api.reorderDefaultPlaylist(groupId, libId, direction);
    await refreshGroups();
  }, [refreshGroups]);

  const addEvent = useCallback(async (groupId: string, event: Omit<ScheduleEvent, 'id'>) => {
    const ev = await api.addEvent(groupId, event);
    await refreshGroups();
    return ev;
  }, [refreshGroups]);

  const removeEvent = useCallback(async (groupId: string, eventId: string) => {
    await api.removeEvent(groupId, eventId);
    await refreshGroups();
  }, [refreshGroups]);

  // Duplicates an existing event within the same group — no dedicated backend
  // endpoint, since it's just a normal addEvent with the source event's own fields
  // copied in (mirrors forceContentAllScreens's "no new API surface needed" reasoning).
  const duplicateEvent = useCallback(async (groupId: string, eventId: string) => {
    const group = groups.find((g) => g.id === groupId);
    const event = group?.events.find((e) => e.id === eventId);
    if (!event) return;
    await api.addEvent(groupId, {
      name: `${event.name} (copy)`, start: event.start, end: event.end, libIds: [...event.libIds],
      startTime: event.startTime, endTime: event.endTime,
    });
    await refreshGroups();
    showToast('Event duplicated');
  }, [groups, refreshGroups, showToast]);

  const setForcedContent = useCallback(async (groupId: string, libId: string | null) => {
    await api.setForcedContent(groupId, libId);
    await refreshGroups();
  }, [refreshGroups]);

  // Mirrors forceAnnouncementAllScreens below: same per-group forcedContentId,
  // just applied to every group at once via a client-side loop, no new endpoint.
  // Also covers standalone screens (no group) via their own forcedContentId, so
  // "every screen" is actually every screen, not just ones assigned somewhere.
  const forceContentAllScreens = useCallback(async (libId: string | null) => {
    const misc = devices.filter((d) => !d.groupId);
    await Promise.all([
      ...groups.map((g) => api.setForcedContent(g.id, libId)),
      ...misc.map((d) => api.setDeviceForcedContent(d.id, libId)),
    ]);
    await Promise.all([refreshGroups(), refreshDevices()]);
    showToast(libId ? 'Content forced on for every screen' : 'Forced content cleared on every screen');
  }, [groups, devices, refreshGroups, refreshDevices, showToast]);

  const setForcedAnnouncement = useCallback(async (groupId: string, announcementId: string | null) => {
    await api.setForcedAnnouncement(groupId, announcementId);
    await refreshGroups();
  }, [refreshGroups]);

  // "Force on all screens" on the Home page: no dedicated backend endpoint for this —
  // it's the exact same per-group forcedAnnouncementId, just applied to every
  // group at once, so a client-side loop over the existing per-group call is all
  // this needs rather than a new bulk-specific API surface. Standalone screens (no
  // group) have no forcedAnnouncementId of their own — their manual
  // announcementId/announcementOn toggle already IS the forcing mechanism (see
  // Device.forcedContentId's comment in api/types.ts), so this sets that directly.
  const forceAnnouncementAllScreens = useCallback(async (announcementId: string | null) => {
    const misc = devices.filter((d) => !d.groupId);
    await Promise.all([
      ...groups.map((g) => api.setForcedAnnouncement(g.id, announcementId)),
      ...misc.map((d) => api.setDeviceAnnouncement(d.id, announcementId)),
    ]);
    await Promise.all([refreshGroups(), refreshDevices()]);
    showToast(announcementId ? 'Announcement forced on for every screen' : 'Announcement cleared on every screen');
  }, [groups, devices, refreshGroups, refreshDevices, showToast]);

  const setGroupBlackout = useCallback(async (groupId: string, blackout: boolean) => {
    await api.setGroupBlackout(groupId, blackout);
    await refreshGroups();
  }, [refreshGroups]);

  // "Blackout all screens": same client-side-loop-over-the-per-group-call pattern
  // as forceContentAllScreens/forceAnnouncementAllScreens above — no dedicated bulk
  // endpoint needed for an emergency action this rare. Also covers standalone screens
  // (no group) via their own blackout field.
  const blackoutAllScreens = useCallback(async (blackout: boolean) => {
    const misc = devices.filter((d) => !d.groupId);
    await Promise.all([
      ...groups.map((g) => api.setGroupBlackout(g.id, blackout)),
      ...misc.map((d) => api.setDeviceBlackout(d.id, blackout)),
    ]);
    await Promise.all([refreshGroups(), refreshDevices()]);
    showToast(blackout ? 'Every screen blacked out' : 'Blackout cleared on every screen');
  }, [groups, devices, refreshGroups, refreshDevices, showToast]);

  const addAnnouncementSchedule = useCallback(async (groupId: string, schedule: Omit<AnnouncementSchedule, 'id'>) => {
    const s = await api.addAnnouncementSchedule(groupId, schedule);
    await refreshGroups();
    return s;
  }, [refreshGroups]);

  const removeAnnouncementSchedule = useCallback(async (groupId: string, scheduleId: string) => {
    await api.removeAnnouncementSchedule(groupId, scheduleId);
    await refreshGroups();
  }, [refreshGroups]);

  // ---- Devices ----
  const pairDevice = useCallback(async (input: { name: string; ip: string; groupId: string | null; locationId?: string | null; status?: DeviceStatus }) => {
    const device = await api.pairDevice(input);
    await Promise.all([refreshDevices(), refreshGroups()]);
    return device;
  }, [refreshDevices, refreshGroups]);

  const renameDevice = useCallback(async (id: string, name: string) => {
    await api.renameDevice(id, name);
    await refreshDevices();
  }, [refreshDevices]);

  const moveDevice = useCallback(async (id: string, groupId: string | null) => {
    await api.moveDevice(id, groupId);
    await refreshDevices();
  }, [refreshDevices]);

  const setDeviceLocation = useCallback(async (id: string, locationId: string | null) => {
    await api.setDeviceLocation(id, locationId);
    await refreshDevices();
  }, [refreshDevices]);

  const reorderDevices = useCallback(async (ids: string[]) => {
    await api.reorderDevices(ids);
    await refreshDevices();
  }, [refreshDevices]);

  const setDeviceForcedContent = useCallback(async (id: string, libId: string | null) => {
    await api.setDeviceForcedContent(id, libId);
    await refreshDevices();
  }, [refreshDevices]);

  const setDeviceBlackout = useCallback(async (id: string, blackout: boolean) => {
    await api.setDeviceBlackout(id, blackout);
    await refreshDevices();
  }, [refreshDevices]);

  const setDeviceDefaultPlaylist = useCallback(async (deviceId: string, libIds: string[]) => {
    await api.setDeviceDefaultPlaylist(deviceId, libIds);
    await refreshDevices();
  }, [refreshDevices]);

  const addToDeviceDefaultPlaylist = useCallback(async (deviceId: string, libIds: string[]) => {
    await api.addToDeviceDefaultPlaylist(deviceId, libIds);
    await refreshDevices();
  }, [refreshDevices]);

  const removeFromDeviceDefaultPlaylist = useCallback(async (deviceId: string, libId: string) => {
    await api.removeFromDeviceDefaultPlaylist(deviceId, libId);
    await refreshDevices();
  }, [refreshDevices]);

  const reorderDeviceDefaultPlaylist = useCallback(async (deviceId: string, libId: string, direction: 'up' | 'down') => {
    await api.reorderDeviceDefaultPlaylist(deviceId, libId, direction);
    await refreshDevices();
  }, [refreshDevices]);

  const addDeviceEvent = useCallback(async (deviceId: string, event: Omit<ScheduleEvent, 'id'>) => {
    const ev = await api.addDeviceEvent(deviceId, event);
    await refreshDevices();
    return ev;
  }, [refreshDevices]);

  const removeDeviceEvent = useCallback(async (deviceId: string, eventId: string) => {
    await api.removeDeviceEvent(deviceId, eventId);
    await refreshDevices();
  }, [refreshDevices]);

  // Mirrors duplicateEvent's own reasoning — no dedicated backend endpoint needed.
  const duplicateDeviceEvent = useCallback(async (deviceId: string, eventId: string) => {
    const device = devices.find((d) => d.id === deviceId);
    const event = device?.events.find((e) => e.id === eventId);
    if (!event) return;
    await api.addDeviceEvent(deviceId, {
      name: `${event.name} (copy)`, start: event.start, end: event.end, libIds: [...event.libIds],
      startTime: event.startTime, endTime: event.endTime,
    });
    await refreshDevices();
    showToast('Event duplicated');
  }, [devices, refreshDevices, showToast]);

  const removeDevice = useCallback(async (id: string) => {
    await api.removeDevice(id);
    await refreshDevices();
  }, [refreshDevices]);

  const restartDevice = useCallback(async (device: Device) => {
    await api.restartDevice(device.id);
    showToast(`Restarting ${device.name}…`);
  }, [showToast]);

  const flashDevice = useCallback(async (device: Device) => {
    await api.flashDevice(device.id);
    showToast(`Identifying ${device.name}…`);
  }, [showToast]);

  // Flash every screen in a group / every screen overall — one best-effort
  // identify-flash request per device (same direct hub->Pi call flashDevice makes,
  // which can fail if a screen is briefly unreachable), fanned out client-side the
  // same way forceContentAllScreens/blackoutAllScreens are. Promise.allSettled (not
  // Promise.all) so one unreachable screen doesn't stop the rest from flashing.
  const flashGroup = useCallback(async (group: Group) => {
    const groupDevices = devices.filter((d) => d.groupId === group.id);
    const results = await Promise.allSettled(groupDevices.map((d) => api.flashDevice(d.id)));
    const failed = results.filter((r) => r.status === 'rejected').length;
    showToast(
      failed > 0
        ? `Flashed ${groupDevices.length - failed}/${groupDevices.length} screens in ${group.name} (${failed} unreachable)`
        : `Flashing every screen in ${group.name}…`,
    );
  }, [devices, showToast]);

  const flashAllScreens = useCallback(async () => {
    const results = await Promise.allSettled(devices.map((d) => api.flashDevice(d.id)));
    const failed = results.filter((r) => r.status === 'rejected').length;
    showToast(
      failed > 0
        ? `Flashed ${devices.length - failed}/${devices.length} screens (${failed} unreachable)`
        : 'Flashing every screen…',
    );
  }, [devices, showToast]);

  const setDeviceAnnouncement = useCallback(async (id: string, announcementId: string | null) => {
    await api.setDeviceAnnouncement(id, announcementId);
    await refreshDevices();
  }, [refreshDevices]);

  const toggleDeviceAnnouncement = useCallback(async (id: string) => {
    await api.toggleDeviceAnnouncement(id);
    await refreshDevices();
  }, [refreshDevices]);

  const setDeviceVideoQuality = useCallback(async (id: string, videoQuality: 'auto' | 'full') => {
    await api.setDeviceVideoQuality(id, videoQuality);
    await refreshDevices();
  }, [refreshDevices]);

  const scanNetwork = useCallback((): Promise<DiscoveredDevice[]> => api.scanNetwork(), []);

  // ---- Backup / restore ----
  const exportBackup = useCallback((): Promise<Backup> => api.exportBackup(), []);
  const importBackup = useCallback(async (backup: Backup) => {
    await api.importBackup(backup);
  }, []);

  return {
    loaded,
    library,
    groups,
    devices,
    folders,
    locations,
    safetyHold,
    setSafetyHold,
    toast,
    showToast,
    addImage,
    addVideo,
    addPdf,
    addAnnouncement,
    addClock,
    addNdiSource,
    listNdiSources,
    setNdiSourceName,
    addTflStatus,
    searchTflStations,
    addTflArrivals,
    setTflModes,
    setTflStations,
    setItemDuration,
    renameLibraryItem,
    reorderLibrary,
    setLibraryItemTags,
    setLibraryItemFolder,
    removeLibraryItem,
    removeLibraryItems,
    addFolder,
    renameFolder,
    moveFolder,
    removeFolder,
    addLocation,
    renameLocation,
    deleteLocation,
    reorderLocations,
    addGroup,
    renameGroup,
    setGroupLocation,
    deleteGroup,
    reorderGroups,
    addToDefaultPlaylist,
    removeFromDefaultPlaylist,
    reorderDefaultPlaylist,
    addEvent,
    removeEvent,
    duplicateEvent,
    setForcedContent,
    forceContentAllScreens,
    setForcedAnnouncement,
    forceAnnouncementAllScreens,
    setGroupBlackout,
    blackoutAllScreens,
    addAnnouncementSchedule,
    removeAnnouncementSchedule,
    pairDevice,
    renameDevice,
    moveDevice,
    setDeviceLocation,
    reorderDevices,
    removeDevice,
    restartDevice,
    flashDevice,
    flashGroup,
    flashAllScreens,
    setDeviceAnnouncement,
    toggleDeviceAnnouncement,
    setDeviceVideoQuality,
    setDeviceForcedContent,
    setDeviceBlackout,
    setDeviceDefaultPlaylist,
    addToDeviceDefaultPlaylist,
    removeFromDeviceDefaultPlaylist,
    reorderDeviceDefaultPlaylist,
    addDeviceEvent,
    removeDeviceEvent,
    duplicateDeviceEvent,
    scanNetwork,
    exportBackup,
    importBackup,
  };
}

export type AppState = ReturnType<typeof useAppState>;
