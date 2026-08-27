import { useState } from 'react';
import { AppShell, type Tab } from './components/layout/AppShell';
import { HomeScreen } from './screens/HomeScreen';
import { LibraryScreen } from './screens/LibraryScreen';
import { ScheduleScreen } from './screens/ScheduleScreen';
import { AnnouncementsScreen } from './screens/AnnouncementsScreen';
import { SettingsScreen } from './screens/SettingsScreen';
import { Toast } from './components/Toast';
import { PairDeviceDialog } from './components/dialogs/PairDeviceDialog';
import { AddContentDialog } from './components/dialogs/AddContentDialog';
import { AddEventDialog } from './components/dialogs/AddEventDialog';
import { AddAnnouncementDialog } from './components/dialogs/AddAnnouncementDialog';
import { AnnouncementPickerDialog } from './components/dialogs/AnnouncementPickerDialog';
import { ForceAnnouncementDialog } from './components/dialogs/ForceAnnouncementDialog';
import { AddAnnouncementScheduleDialog } from './components/dialogs/AddAnnouncementScheduleDialog';
import { MoveDeviceDialog } from './components/dialogs/MoveDeviceDialog';
import { ForceContentDialog } from './components/dialogs/ForceContentDialog';
import { useAppState } from './hooks/useAppState';
import type { Device, Group } from './api/types';

type DialogState =
  | { type: 'pair' }
  | { type: 'addContent'; groupId: string }
  | { type: 'addEvent'; groupId: string }
  | { type: 'addAnnouncement' }
  | { type: 'announcementPicker'; device: Device }
  | { type: 'moveDevice'; device: Device }
  | { type: 'forceContent'; group: Group }
  /** `groupId: null` means the global "force on every screen" action from the Home tab. */
  | { type: 'forceAnnouncement'; groupId: string | null }
  | { type: 'addAnnouncementSchedule'; groupId: string }
  | null;

export default function App() {
  const app = useAppState();
  const [tab, setTab] = useState<Tab>('home');
  const [dialog, setDialog] = useState<DialogState>(null);

  const closeDialog = () => setDialog(null);

  if (!app.loaded) return null;

  return (
    <>
      <AppShell tab={tab} onTabChange={setTab} deviceCount={app.devices.length} onAddScreen={() => setDialog({ type: 'pair' })}>
        {tab === 'home' && (
          <HomeScreen
            app={app}
            onAddScreen={() => setDialog({ type: 'pair' })}
            onForceContent={(group) => setDialog({ type: 'forceContent', group })}
            onForceAnnouncementAllScreens={() => setDialog({ type: 'forceAnnouncement', groupId: null })}
            onMoveDevice={(device) => setDialog({ type: 'moveDevice', device })}
            onPickAnnouncement={(device) => setDialog({ type: 'announcementPicker', device })}
          />
        )}
        {tab === 'library' && (
          <LibraryScreen app={app} onOpenAnnounceDialog={() => setDialog({ type: 'addAnnouncement' })} />
        )}
        {tab === 'schedule' && (
          <ScheduleScreen
            app={app}
            onOpenAddContent={(groupId) => setDialog({ type: 'addContent', groupId })}
            onOpenAddEvent={(groupId) => setDialog({ type: 'addEvent', groupId })}
          />
        )}
        {tab === 'announcements' && (
          <AnnouncementsScreen
            app={app}
            onOpenForceAnnouncement={(groupId) => setDialog({ type: 'forceAnnouncement', groupId })}
            onOpenAddSchedule={(groupId) => setDialog({ type: 'addAnnouncementSchedule', groupId })}
          />
        )}
        {tab === 'settings' && <SettingsScreen app={app} />}
      </AppShell>

      {dialog?.type === 'pair' && <PairDeviceDialog app={app} onClose={closeDialog} />}
      {dialog?.type === 'addContent' && <AddContentDialog app={app} groupId={dialog.groupId} onClose={closeDialog} />}
      {dialog?.type === 'addEvent' && <AddEventDialog app={app} groupId={dialog.groupId} onClose={closeDialog} />}
      {dialog?.type === 'addAnnouncement' && <AddAnnouncementDialog app={app} onClose={closeDialog} />}
      {dialog?.type === 'announcementPicker' && <AnnouncementPickerDialog app={app} device={dialog.device} onClose={closeDialog} />}
      {dialog?.type === 'moveDevice' && <MoveDeviceDialog app={app} device={dialog.device} onClose={closeDialog} />}
      {dialog?.type === 'forceContent' && <ForceContentDialog app={app} group={dialog.group} onClose={closeDialog} />}
      {dialog?.type === 'forceAnnouncement' && (
        <ForceAnnouncementDialog
          app={app}
          scopeLabel={dialog.groupId ? 'this location' : 'every screen'}
          currentId={dialog.groupId ? (app.groups.find((g) => g.id === dialog.groupId)?.forcedAnnouncementId ?? null) : null}
          onConfirm={(announcementId) =>
            dialog.groupId ? app.setForcedAnnouncement(dialog.groupId, announcementId) : app.forceAnnouncementAllScreens(announcementId)
          }
          onClose={closeDialog}
        />
      )}
      {dialog?.type === 'addAnnouncementSchedule' && <AddAnnouncementScheduleDialog app={app} groupId={dialog.groupId} onClose={closeDialog} />}

      <Toast message={app.toast} />
    </>
  );
}
