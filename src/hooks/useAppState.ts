import { useCallback, useEffect, useRef, useState } from 'react';
import { api, type DiscoveredDevice } from '../api/client';
import type { AnnouncementSchedule, Device, DeviceStatus, Group, LibraryItem, ScheduleEvent } from '../api/types';

export function useAppState() {
  const [library, setLibrary] = useState<LibraryItem[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [devices, setDevices] = useState<Device[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [toast, setToast] = useState('');
  const toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const refreshLibrary = useCallback(async () => setLibrary(await api.listLibrary()), []);
  const refreshGroups = useCallback(async () => setGroups(await api.listGroups()), []);
  const refreshDevices = useCallback(async () => setDevices(await api.listDevices()), []);

  useEffect(() => {
    (async () => {
      await Promise.all([refreshLibrary(), refreshGroups(), refreshDevices()]);
      setLoaded(true);
    })();
  }, [refreshLibrary, refreshGroups, refreshDevices]);

  // Device online/offline status (and group-level forced/scheduled announcement
  // state) can change on their own with nobody touching the control app - a screen
  // going offline, or a schedule's start/end time passing - so the one-time load
  // above isn't enough; without this, the UI only ever catches up on those after
  // some unrelated action happens to trigger its own refreshDevices()/refreshGroups()
  // call, or the page is manually reloaded. 10s errs toward the hub's own 45s
  // online/offline window (see ONLINE_WINDOW_MS) without polling too aggressively.
  useEffect(() => {
    const id = setInterval(() => {
      void refreshDevices();
      void refreshGroups();
    }, 10_000);
    return () => clearInterval(id);
  }, [refreshDevices, refreshGroups]);

  const showToast = useCallback((message: string) => {
    clearTimeout(toastTimer.current);
    setToast(message);
    toastTimer.current = setTimeout(() => setToast(''), 2600);
  }, []);

  // ---- Library ----
  const addImage = useCallback(async (file: File) => {
    const item = await api.addImage(file);
    await refreshLibrary();
    return item;
  }, [refreshLibrary]);

  const addVideo = useCallback(async (file: File) => {
    const item = await api.addVideo(file);
    await refreshLibrary();
    return item;
  }, [refreshLibrary]);

  const addPdf = useCallback(async (file: File) => {
    const item = await api.addPdf(file);
    await refreshLibrary();
    return item;
  }, [refreshLibrary]);

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

  const setItemDuration = useCallback(async (id: string, durationSec: number) => {
    await api.setItemDuration(id, durationSec);
    await refreshLibrary();
  }, [refreshLibrary]);

  const renameLibraryItem = useCallback(async (id: string, name: string) => {
    await api.renameLibraryItem(id, name);
    await refreshLibrary();
  }, [refreshLibrary]);

  const removeLibraryItem = useCallback(async (id: string) => {
    await api.removeLibraryItem(id);
    await Promise.all([refreshLibrary(), refreshGroups(), refreshDevices()]);
  }, [refreshLibrary, refreshGroups, refreshDevices]);

  // ---- Groups / locations ----
  const addGroup = useCallback(async (name: string) => {
    const group = await api.addGroup(name);
    await refreshGroups();
    return group;
  }, [refreshGroups]);

  const renameGroup = useCallback(async (id: string, name: string) => {
    await api.renameGroup(id, name);
    await refreshGroups();
  }, [refreshGroups]);

  const deleteGroup = useCallback(async (id: string) => {
    const ok = await api.deleteGroup(id);
    if (ok) await refreshGroups();
    return ok;
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

  const setForcedContent = useCallback(async (groupId: string, libId: string | null) => {
    await api.setForcedContent(groupId, libId);
    await refreshGroups();
  }, [refreshGroups]);

  // Mirrors forceAnnouncementAllScreens below: same per-location forcedContentId,
  // just applied to every location at once via a client-side loop, no new endpoint.
  const forceContentAllScreens = useCallback(async (libId: string | null) => {
    await Promise.all(groups.map((g) => api.setForcedContent(g.id, libId)));
    await refreshGroups();
    showToast(libId ? 'Content forced on for every screen' : 'Forced content cleared on every screen');
  }, [groups, refreshGroups, showToast]);

  const setForcedAnnouncement = useCallback(async (groupId: string, announcementId: string | null) => {
    await api.setForcedAnnouncement(groupId, announcementId);
    await refreshGroups();
  }, [refreshGroups]);

  // "Force on all screens" on the Home page: no dedicated backend endpoint for this —
  // it's the exact same per-location forcedAnnouncementId, just applied to every
  // location at once, so a client-side loop over the existing per-group call is all
  // this needs rather than a new bulk-specific API surface.
  const forceAnnouncementAllScreens = useCallback(async (announcementId: string | null) => {
    await Promise.all(groups.map((g) => api.setForcedAnnouncement(g.id, announcementId)));
    await refreshGroups();
    showToast(announcementId ? 'Announcement forced on for every screen' : 'Announcement cleared on every screen');
  }, [groups, refreshGroups, showToast]);

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
  const pairDevice = useCallback(async (input: { name: string; ip: string; groupId: string; status?: DeviceStatus }) => {
    const device = await api.pairDevice(input);
    await Promise.all([refreshDevices(), refreshGroups()]);
    return device;
  }, [refreshDevices, refreshGroups]);

  const renameDevice = useCallback(async (id: string, name: string) => {
    await api.renameDevice(id, name);
    await refreshDevices();
  }, [refreshDevices]);

  const moveDevice = useCallback(async (id: string, groupId: string) => {
    await api.moveDevice(id, groupId);
    await refreshDevices();
  }, [refreshDevices]);

  const removeDevice = useCallback(async (id: string) => {
    await api.removeDevice(id);
    await refreshDevices();
  }, [refreshDevices]);

  const restartDevice = useCallback(async (device: Device) => {
    await api.restartDevice(device.id);
    showToast(`Restarting ${device.name}…`);
  }, [showToast]);

  const setDeviceAnnouncement = useCallback(async (id: string, announcementId: string | null) => {
    await api.setDeviceAnnouncement(id, announcementId);
    await refreshDevices();
  }, [refreshDevices]);

  const toggleDeviceAnnouncement = useCallback(async (id: string) => {
    await api.toggleDeviceAnnouncement(id);
    await refreshDevices();
  }, [refreshDevices]);

  const scanNetwork = useCallback((): Promise<DiscoveredDevice[]> => api.scanNetwork(), []);

  return {
    loaded,
    library,
    groups,
    devices,
    toast,
    showToast,
    addImage,
    addVideo,
    addPdf,
    addAnnouncement,
    addClock,
    setItemDuration,
    renameLibraryItem,
    removeLibraryItem,
    addGroup,
    renameGroup,
    deleteGroup,
    addToDefaultPlaylist,
    removeFromDefaultPlaylist,
    reorderDefaultPlaylist,
    addEvent,
    removeEvent,
    setForcedContent,
    forceContentAllScreens,
    setForcedAnnouncement,
    forceAnnouncementAllScreens,
    addAnnouncementSchedule,
    removeAnnouncementSchedule,
    pairDevice,
    renameDevice,
    moveDevice,
    removeDevice,
    restartDevice,
    setDeviceAnnouncement,
    toggleDeviceAnnouncement,
    scanNetwork,
  };
}

export type AppState = ReturnType<typeof useAppState>;
