import { useCallback, useEffect, useRef, useState } from 'react';
import { api, type DiscoveredDevice } from '../api/client';
import type { Device, DeviceStatus, Group, LibraryItem, ScheduleEvent } from '../api/types';

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
