import { useCallback, useEffect, useRef, useState } from 'react';
import { api, type DiscoveredDevice } from '../api/client';
import type { AnnouncementSchedule, Backup, Device, DeviceStatus, Folder, Group, LibraryItem, Location, SavedHubNetwork, ScheduleEvent, TflStationConfig, UpdateEvent } from '../api/types';

// One row of updateAllDevices' result breakdown — see UpdateResultsDialog.tsx.
export interface UpdateResult {
  device: Device;
  error: string | null;
}

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
  const [savedHubNetworks, setSavedHubNetworksState] = useState<SavedHubNetwork[]>([]);
  // Null in standalone/localStorage mode, or if the hub itself can't tell what
  // commit it's running (see hub/src/version.ts) — either way, Settings just shows
  // each screen's raw version with nothing to compare it to. Fetched once, not
  // polled: a running hub's own commit can't change without a restart.
  const [hubVersion, setHubVersion] = useState<string | null>(null);
  // Settings screen's "Update log" — fetched on load and refreshed after every
  // update/reprovision trigger (see updateDevice/reprovisionDevice/updateAllDevices
  // below), not on the fast 4s device poll: this changes far less often than device
  // status, and refreshing it there would mean every tab re-fetching it 15x/minute
  // for a list that's realistically appended to a few times a day at most.
  const [updateLog, setUpdateLog] = useState<UpdateEvent[]>([]);
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
  const refreshUpdateLog = useCallback(async () => setUpdateLog(await api.getUpdateLog()), []);

  // Tracks each device's last-known status across polls (not React state — this
  // must never itself trigger a render) purely to detect an online->offline
  // transition below; a device that's simply always been offline (never seen
  // online by this tab) or one seen for the first time on this poll doesn't fire,
  // so pairing a new not-yet-heartbeated screen doesn't spam this on load.
  const prevDeviceStatus = useRef<Map<string, DeviceStatus>>(new Map());
  // Same "skip the very first poll" reasoning as prevDeviceStatus above — otherwise
  // a screen that happens to be mid-update (or stuck 'failed') the moment this tab
  // loads would fire a stale "updated"/"update may have failed" toast immediately,
  // for an update this tab never saw get triggered.
  const prevUpdateStatus = useRef<Map<string, Device['updateStatus']>>(new Map());
  const isFirstDevicePoll = useRef(true);

  const refreshDevices = useCallback(async () => {
    const next = await api.listDevices();
    if (!isFirstDevicePoll.current) {
      for (const d of next) {
        if (prevDeviceStatus.current.get(d.id) === 'online' && d.status === 'offline') {
          showToast(`${d.name} went offline`);
        }
        const prevUpdate = prevUpdateStatus.current.get(d.id);
        if (prevUpdate === 'updating' && d.updateStatus === 'done') {
          showToast(`${d.name} updated successfully`);
        } else if (prevUpdate === 'updating' && d.updateStatus === 'failed') {
          showToast(`${d.name}'s update is taking far longer than expected — check it manually`);
        }
      }
    }
    isFirstDevicePoll.current = false;
    prevDeviceStatus.current = new Map(next.map((d) => [d.id, d.status]));
    prevUpdateStatus.current = new Map(next.map((d) => [d.id, d.updateStatus]));
    setDevices(next);
  }, [showToast]);

  const refreshSettings = useCallback(async () => {
    const settings = await api.getSettings();
    setSafetyHoldState(settings.safetyHold);
    setSavedHubNetworksState(settings.savedHubNetworks);
  }, []);

  const setSafetyHold = useCallback(async (enabled: boolean) => {
    await api.setSafetyHold(enabled);
    setSafetyHoldState(enabled);
    showToast(enabled ? 'Safety hold enabled' : 'Safety hold disabled');
  }, [showToast]);

  const setSavedHubNetworks = useCallback(async (networks: SavedHubNetwork[]) => {
    await api.setSavedHubNetworks(networks);
    setSavedHubNetworksState(networks);
  }, []);

  useEffect(() => {
    (async () => {
      await Promise.all([refreshLibrary(), refreshGroups(), refreshDevices(), refreshSettings(), refreshFolders(), refreshLocations(), refreshUpdateLog()]);
      api.getHubVersion().then((r) => setHubVersion(r.hubVersion)).catch(() => setHubVersion(null));
      setLoaded(true);
    })();
  }, [refreshLibrary, refreshGroups, refreshDevices, refreshSettings, refreshFolders, refreshLocations, refreshUpdateLog]);

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

  const setForcedPlaylist = useCallback(async (groupId: string, libIds: string[]) => {
    await api.setForcedPlaylist(groupId, libIds);
    await refreshGroups();
  }, [refreshGroups]);

  const addToForcedPlaylist = useCallback(async (groupId: string, libIds: string[]) => {
    await api.addToForcedPlaylist(groupId, libIds);
    await refreshGroups();
  }, [refreshGroups]);

  const removeFromForcedPlaylist = useCallback(async (groupId: string, libId: string) => {
    await api.removeFromForcedPlaylist(groupId, libId);
    await refreshGroups();
  }, [refreshGroups]);

  const reorderForcedPlaylist = useCallback(async (groupId: string, libId: string, direction: 'up' | 'down') => {
    await api.reorderForcedPlaylist(groupId, libId, direction);
    await refreshGroups();
  }, [refreshGroups]);

  // Mirrors forceAnnouncementAllScreens below: same per-group forcedPlaylist,
  // just applied to every group at once via a client-side loop, no new endpoint.
  // Also covers standalone screens (no group) via their own forcedPlaylist, so
  // "every screen" is actually every screen, not just ones assigned somewhere.
  const forceContentAllScreens = useCallback(async (libIds: string[]) => {
    const misc = devices.filter((d) => !d.groupId);
    await Promise.all([
      ...groups.map((g) => api.setForcedPlaylist(g.id, libIds)),
      ...misc.map((d) => api.setDeviceForcedPlaylist(d.id, libIds)),
    ]);
    await Promise.all([refreshGroups(), refreshDevices()]);
    showToast(libIds.length > 0 ? 'Content forced on for every screen' : 'Forced content cleared on every screen');
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
  // Device.forcedPlaylist's comment in api/types.ts), so this sets that directly.
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
  const pairDevice = useCallback(async (input: { name: string; ip: string; groupId: string | null; locationId?: string | null; status?: DeviceStatus; hubUrl?: string }) => {
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

  // Catches and toasts its own failure (same reasoning as updateDevice/
  // clearUsbOverride above) — a duplicate-IP conflict is a real, expected
  // failure mode here (see api/client.ts's setDeviceIp comment), not a rare
  // edge case worth leaving as a silent unhandled rejection.
  const setDeviceIp = useCallback(async (device: Device, ip: string, hubUrl?: string) => {
    // Captured before the call resolves and refreshDevices() updates `devices` —
    // used only to pick the right toast wording (did the IP itself change, or was
    // this a same-IP re-sync to force-correct a stale hubUrl on the Pi?).
    const ipChanged = ip !== device.ip;
    try {
      const { reconfigured } = await api.setDeviceIp(device.id, ip, hubUrl);
      await refreshDevices();
      showToast(reconfigured
        ? (ipChanged ? `${device.name} is now at ${ip} — reconfigured and ready` : `${device.name} re-synced — it'll pick up any address change`)
        : `Saved ${ip} for ${device.name} — nothing answered there yet, but it'll pick this up once it's reachable`);
    } catch (err) {
      showToast(err instanceof Error ? err.message : `Could not update ${device.name}'s IP`);
    }
  }, [refreshDevices, showToast]);

  const reorderDevices = useCallback(async (ids: string[]) => {
    await api.reorderDevices(ids);
    await refreshDevices();
  }, [refreshDevices]);

  const setDeviceForcedPlaylist = useCallback(async (deviceId: string, libIds: string[]) => {
    await api.setDeviceForcedPlaylist(deviceId, libIds);
    await refreshDevices();
  }, [refreshDevices]);

  const addToDeviceForcedPlaylist = useCallback(async (deviceId: string, libIds: string[]) => {
    await api.addToDeviceForcedPlaylist(deviceId, libIds);
    await refreshDevices();
  }, [refreshDevices]);

  const removeFromDeviceForcedPlaylist = useCallback(async (deviceId: string, libId: string) => {
    await api.removeFromDeviceForcedPlaylist(deviceId, libId);
    await refreshDevices();
  }, [refreshDevices]);

  const reorderDeviceForcedPlaylist = useCallback(async (deviceId: string, libId: string, direction: 'up' | 'down') => {
    await api.reorderDeviceForcedPlaylist(deviceId, libId, direction);
    await refreshDevices();
  }, [refreshDevices]);

  const setDeviceBlackout = useCallback(async (id: string, blackout: boolean) => {
    await api.setDeviceBlackout(id, blackout);
    await refreshDevices();
  }, [refreshDevices]);

  // Catches and toasts its own failure rather than leaving an unhandled rejection
  // (same reasoning as updateDevice below): the badge this button lives on only
  // shows up because the screen is already ignoring the hub, so the clear attempt
  // itself failing to reach it is a real, not-rare case worth surfacing rather
  // than a silent no-op.
  const clearUsbOverride = useCallback(async (device: Device) => {
    try {
      await api.clearUsbOverride(device.id);
      await refreshDevices();
      showToast(`USB override cleared on ${device.name}`);
    } catch (err) {
      showToast(err instanceof Error ? err.message : `Could not clear the USB override on ${device.name}`);
    }
  }, [refreshDevices, showToast]);

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

  // A real hardware reboot now (see pi-player/src/agent.ts's /restart handler),
  // not just a quick process bounce — confirmed here, centrally, so every button
  // that calls this (Home's device card, Settings' per-screen row) gets the same
  // prompt without each needing its own window.confirm.
  const restartDevice = useCallback(async (device: Device) => {
    if (!window.confirm(`Reboot ${device.name}? The screen will go black for a minute or so while it comes back up.`)) return;
    await api.restartDevice(device.id);
    showToast(`Rebooting ${device.name}…`);
  }, [showToast]);

  const flashDevice = useCallback(async (device: Device) => {
    await api.flashDevice(device.id);
    showToast(`Identifying ${device.name}…`);
  }, [showToast]);

  // Just a passthrough for the preview dialog — no app state to refresh, same
  // reasoning as listNdiSources above.
  const previewDevice = useCallback((id: string): Promise<string> => api.previewDevice(id), []);

  // Unlike flashDevice/restartDevice above, these catch and toast their own
  // failures rather than leaving an unhandled rejection: the single most likely
  // failure — a screen that hasn't been re-provisioned since this capability
  // shipped — is a near-certainty on the very first click for every
  // already-deployed screen, not a rare edge case, so it needs to be visible
  // rather than silent.
  const updateDevice = useCallback(async (device: Device) => {
    try {
      await api.updateDevice(device.id);
      showToast(`Updating ${device.name}… this can take up to a minute.`);
      // Picks up updateStatus: 'updating' right away rather than waiting for the
      // next 4s poll — the whole point of this call is to show a live status
      // instead of just the toast above, which used to be the only feedback.
      await Promise.all([refreshDevices(), refreshUpdateLog()]);
    } catch (err) {
      showToast(err instanceof Error ? err.message : `Could not update ${device.name}`);
    }
  }, [showToast, refreshDevices, refreshUpdateLog]);

  const reprovisionDevice = useCallback(async (device: Device) => {
    try {
      await api.reprovisionDevice(device.id);
      showToast(`Re-provisioning ${device.name}… it will reboot shortly.`);
      await Promise.all([refreshDevices(), refreshUpdateLog()]);
    } catch (err) {
      showToast(err instanceof Error ? err.message : `Could not re-provision ${device.name}`);
    }
  }, [showToast, refreshDevices, refreshUpdateLog]);

  // Bulk fast-path update, skipping devices already known offline (no point
  // spending a round trip on a screen that can't answer). Deliberately calls
  // api.updateDevice directly rather than the single-device updateDevice above —
  // that one shows its own toast per call, which would just overwrite itself N
  // times in a row here. Returns the full per-screen breakdown (null if there was
  // nothing to do) rather than just a toast, so the caller can show exactly which
  // screens succeeded and which failed and why — see UpdateResultsDialog.tsx.
  const updateAllDevices = useCallback(async (): Promise<UpdateResult[] | null> => {
    const targets = devices.filter((d) => d.status === 'online');
    if (targets.length === 0) {
      showToast('No online screens to update.');
      return null;
    }
    const settled = await Promise.allSettled(targets.map((d) => api.updateDevice(d.id)));
    // Same reasoning as updateDevice's own refreshDevices call above — picks up
    // every successfully-triggered screen's updateStatus: 'updating' right away.
    await Promise.all([refreshDevices(), refreshUpdateLog()]);
    return targets.map((device, i) => {
      const outcome = settled[i];
      return {
        device,
        error: outcome.status === 'rejected' ? (outcome.reason instanceof Error ? outcome.reason.message : String(outcome.reason)) : null,
      };
    });
  }, [devices, showToast, refreshDevices, refreshUpdateLog]);

  // Settings screen's "Advanced" section — same bulk shape as updateAllDevices
  // above, just the full re-provision path (system packages, boot config, a
  // reboot) instead of the fast app-only update. Kept separate rather than a
  // shared helper since the two already don't share an api call, and tucking
  // this one behind "Advanced" (plus its own confirm prompt) is deliberate: every
  // targeted screen reboots, which is far more disruptive to do by accident
  // across a whole fleet than the fast update path above.
  const reprovisionAllDevices = useCallback(async (): Promise<UpdateResult[] | null> => {
    const targets = devices.filter((d) => d.status === 'online');
    if (targets.length === 0) {
      showToast('No online screens to re-provision.');
      return null;
    }
    const settled = await Promise.allSettled(targets.map((d) => api.reprovisionDevice(d.id)));
    await Promise.all([refreshDevices(), refreshUpdateLog()]);
    return targets.map((device, i) => {
      const outcome = settled[i];
      return {
        device,
        error: outcome.status === 'rejected' ? (outcome.reason instanceof Error ? outcome.reason.message : String(outcome.reason)) : null,
      };
    });
  }, [devices, showToast, refreshDevices, refreshUpdateLog]);

  // Same "Advanced" section, same bulk shape again — a plain reboot (see
  // restartDevice above) across every online screen at once, with no update_events
  // logging of its own (a restart isn't an Update/Re-provision, just a reboot) so
  // this skips refreshUpdateLog unlike the two bulk actions above.
  const restartAllDevices = useCallback(async (): Promise<UpdateResult[] | null> => {
    const targets = devices.filter((d) => d.status === 'online');
    if (targets.length === 0) {
      showToast('No online screens to restart.');
      return null;
    }
    const settled = await Promise.allSettled(targets.map((d) => api.restartDevice(d.id)));
    await refreshDevices();
    return targets.map((device, i) => {
      const outcome = settled[i];
      return {
        device,
        error: outcome.status === 'rejected' ? (outcome.reason instanceof Error ? outcome.reason.message : String(outcome.reason)) : null,
      };
    });
  }, [devices, showToast, refreshDevices]);

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

  const scanNetwork = useCallback((subnetHint?: string): Promise<DiscoveredDevice[]> => api.scanNetwork(subnetHint), []);

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
    hubVersion,
    updateLog,
    safetyHold,
    setSafetyHold,
    savedHubNetworks,
    setSavedHubNetworks,
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
    setForcedPlaylist,
    addToForcedPlaylist,
    removeFromForcedPlaylist,
    reorderForcedPlaylist,
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
    setDeviceIp,
    reorderDevices,
    removeDevice,
    restartDevice,
    flashDevice,
    previewDevice,
    updateDevice,
    reprovisionDevice,
    updateAllDevices,
    reprovisionAllDevices,
    restartAllDevices,
    setDeviceAnnouncement,
    toggleDeviceAnnouncement,
    setDeviceVideoQuality,
    setDeviceForcedPlaylist,
    addToDeviceForcedPlaylist,
    removeFromDeviceForcedPlaylist,
    reorderDeviceForcedPlaylist,
    setDeviceBlackout,
    clearUsbOverride,
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
