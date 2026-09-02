import { useRef, useState } from 'react';
import { Icon } from '../components/icons/Icon';
import type { AppState } from '../hooks/useAppState';
import type { Theme } from '../hooks/useTheme';
import type { Backup } from '../api/types';
import { copyText } from '../utils/clipboard';
import { authGateEnabled, logout } from '../api/auth';

interface SettingsScreenProps {
  app: AppState;
  onLogout: () => void;
  theme: Theme;
  onSetTheme: (theme: Theme) => void;
  advancedDeviceInfo: boolean;
  onSetAdvancedDeviceInfo: (value: boolean) => void;
  hideAnnouncementRow: boolean;
  onSetHideAnnouncementRow: (value: boolean) => void;
}

function isBackup(value: unknown): value is Backup {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return Array.isArray(v.library) && Array.isArray(v.groups) && Array.isArray(v.devices);
}

export function SettingsScreen({
  app,
  onLogout,
  theme,
  onSetTheme,
  advancedDeviceInfo,
  onSetAdvancedDeviceInfo,
  hideAnnouncementRow,
  onSetHideAnnouncementRow,
}: SettingsScreenProps) {
  const { groups, devices, renameGroup, deleteGroup, renameDevice, removeDevice, showToast, exportBackup, importBackup, safetyHold, setSafetyHold } = app;
  const [editing, setEditing] = useState<{ id: string; kind: 'group' | 'device' } | null>(null);
  const [editingName, setEditingName] = useState('');
  const miscDevices = devices.filter((d) => !d.groupId);
  const [restoring, setRestoring] = useState(false);
  const importInputRef = useRef<HTMLInputElement>(null);

  const devicesWithMac = devices.filter((d): d is typeof d & { mac: string } => !!d.mac);
  const copyMacAddresses = async () => {
    const text = devicesWithMac
      .map((d) => `(Screen Name: "${d.name}" - IP: "${d.ip}" - MAC: "${d.mac}")`)
      .join(',');
    const ok = await copyText(text);
    showToast(ok ? `Copied ${devicesWithMac.length} MAC address${devicesWithMac.length === 1 ? '' : 'es'}` : 'Could not copy — clipboard access denied');
  };

  const downloadBackup = async () => {
    const backup = await exportBackup();
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `signagemadeeasy-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImportFile = async (file: File) => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(await file.text());
    } catch {
      showToast('Not a valid backup file — could not parse JSON');
      return;
    }
    if (!isBackup(parsed)) {
      showToast('Not a valid backup file — missing library/groups/devices');
      return;
    }
    if (!window.confirm('This replaces everything currently saved — content, locations, and paired screens — with this backup. Continue?')) {
      return;
    }
    setRestoring(true);
    try {
      await importBackup(parsed);
      showToast('Backup restored — reloading…');
      window.location.reload();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Restore failed');
      setRestoring(false);
    }
  };

  const startEdit = (id: string, name: string, kind: 'group' | 'device') => {
    setEditing({ id, kind });
    setEditingName(name);
  };
  const save = () => {
    if (editing) {
      if (editing.kind === 'group') renameGroup(editing.id, editingName);
      else renameDevice(editing.id, editingName);
    }
    setEditing(null);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <h1 style={{ margin: 0 }}>Settings</h1>

      <div className="card" style={{ gap: 8 }}>
        <div className="card-kicker">Appearance</div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <span style={{ fontSize: 13 }}>Dark mode</span>
          <label className="toggle">
            <input
              type="checkbox"
              checked={theme === 'dark'}
              onChange={(e) => onSetTheme(e.target.checked ? 'dark' : 'light')}
            />
            <span className="toggle-track">
              <span className="toggle-dot" />
            </span>
          </label>
        </div>
      </div>

      <div className="card" style={{ gap: 8 }}>
        <div className="card-kicker">Device cards</div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <span style={{ fontSize: 13 }}>
            Show advanced device info
            <span className="text-muted" style={{ display: 'block', fontSize: 11 }}>Temperature, throttling, uptime, and disk space — off shows just IP and online/offline</span>
          </span>
          <label className="toggle">
            <input
              type="checkbox"
              checked={advancedDeviceInfo}
              onChange={(e) => onSetAdvancedDeviceInfo(e.target.checked)}
            />
            <span className="toggle-track">
              <span className="toggle-dot" />
            </span>
          </label>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <span style={{ fontSize: 13 }}>
            Show announcement row on each screen
            <span className="text-muted" style={{ display: 'block', fontSize: 11 }}>The per-screen announcement picker and on/off toggle under each device card</span>
          </span>
          <label className="toggle">
            <input
              type="checkbox"
              checked={!hideAnnouncementRow}
              onChange={(e) => onSetHideAnnouncementRow(!e.target.checked)}
            />
            <span className="toggle-track">
              <span className="toggle-dot" />
            </span>
          </label>
        </div>
      </div>

      <div className="card" style={{ gap: 8 }}>
        <div className="card-kicker">Reliability</div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <span style={{ fontSize: 13 }}>
            Safety hold
            <span className="text-muted" style={{ display: 'block', fontSize: 11 }}>
              Assigned by the hub: every screen keeps caching and showing its last-known content if it loses touch
              with the hub, instead of going blank. On by default — turn off to have a disconnected screen show
              nothing instead.
            </span>
          </span>
          <label className="toggle">
            <input
              type="checkbox"
              checked={safetyHold}
              onChange={(e) => void setSafetyHold(e.target.checked)}
            />
            <span className="toggle-track">
              <span className="toggle-dot" />
            </span>
          </label>
        </div>
      </div>

      <div className="card" style={{ gap: 8 }}>
        <div className="card-kicker">Locations & Screens</div>
        {groups.map((group) => {
          const count = devices.filter((d) => d.groupId === group.id).length;
          const isEditing = editing?.kind === 'group' && editing.id === group.id;
          const cannotDelete = count > 0;
          return (
            <div key={group.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0' }}>
              {isEditing ? (
                <input
                  className="input"
                  style={{ flex: 1 }}
                  value={editingName}
                  onChange={(e) => setEditingName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && save()}
                  autoFocus
                />
              ) : (
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13 }}>{group.name}</div>
                  <div className="text-muted" style={{ fontSize: 11 }}>Location</div>
                </div>
              )}
              {!isEditing && <span className="tag tag-neutral">{count} screen{count === 1 ? '' : 's'}</span>}
              {isEditing ? (
                <button type="button" className="btn btn-secondary btn-icon" aria-label="Save" onClick={save}>
                  <Icon name="check" size={13} />
                </button>
              ) : (
                <>
                  <button type="button" className="btn btn-ghost btn-icon" aria-label="Rename" onClick={() => startEdit(group.id, group.name, 'group')}>
                    <Icon name="pencil" size={13} />
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost btn-icon"
                    aria-label="Delete"
                    disabled={cannotDelete}
                    title={cannotDelete ? 'Remove its screens first' : 'Delete location'}
                    onClick={() => deleteGroup(group.id)}
                  >
                    <Icon name="trash" size={13} />
                  </button>
                </>
              )}
            </div>
          );
        })}
        {miscDevices.map((device) => {
          const isEditing = editing?.kind === 'device' && editing.id === device.id;
          return (
            <div key={device.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', borderTop: '1px solid var(--color-divider)' }}>
              {isEditing ? (
                <input
                  className="input"
                  style={{ flex: 1 }}
                  value={editingName}
                  onChange={(e) => setEditingName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && save()}
                  autoFocus
                />
              ) : (
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13 }}>{device.name}</div>
                  <div className="text-muted" style={{ fontSize: 11 }}>Screen · no location</div>
                </div>
              )}
              {isEditing ? (
                <button type="button" className="btn btn-secondary btn-icon" aria-label="Save" onClick={save}>
                  <Icon name="check" size={13} />
                </button>
              ) : (
                <>
                  <button type="button" className="btn btn-ghost btn-icon" aria-label="Rename" onClick={() => startEdit(device.id, device.name, 'device')}>
                    <Icon name="pencil" size={13} />
                  </button>
                  <button type="button" className="btn btn-ghost btn-icon" aria-label="Remove" onClick={() => removeDevice(device.id)}>
                    <Icon name="trash" size={13} />
                  </button>
                </>
              )}
            </div>
          );
        })}
      </div>

      <div className="card" style={{ gap: 8 }}>
        <div className="card-kicker">Network</div>
        <div className="card-title">This computer's Wi-Fi</div>
        <p className="card-body">Screens must be on the same network to appear here.</p>
      </div>

      <div className="card" style={{ gap: 8 }}>
        <div className="card-kicker">IT</div>
        <div className="card-title">Device inventory</div>
        <p className="card-body">
          Copies every paired screen's name, IP, and MAC address as{' '}
          <code>(Screen Name: "" - IP: "" - MAC: "")</code>, one per screen — for network
          whitelisting, asset tracking, or handing off to IT.
        </p>
        <button
          type="button"
          className="btn btn-secondary"
          style={{ alignSelf: 'flex-start' }}
          disabled={devicesWithMac.length === 0}
          onClick={() => void copyMacAddresses()}
        >
          <Icon name="copy" size={14} />
          Copy all MAC addresses{devicesWithMac.length > 0 ? ` (${devicesWithMac.length})` : ''}
        </button>
      </div>

      <div className="card" style={{ gap: 8 }}>
        <div className="card-kicker">Backup</div>
        <div className="card-title">Export / import config</div>
        <p className="card-body">
          Exports everything except the uploaded media files themselves: your content library's
          metadata, locations, playlists, schedules, and every paired screen's name, IP, MAC
          address, and settings — as one JSON file, for future-proofing or restoring a hub. Importing
          replaces everything currently saved with the file's contents.
        </p>
        <input
          ref={importInputRef}
          type="file"
          accept="application/json"
          style={{ display: 'none' }}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void handleImportFile(file);
            e.target.value = '';
          }}
        />
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button type="button" className="btn btn-secondary" onClick={() => void downloadBackup()}>
            <Icon name="download" size={14} />
            Export backup
          </button>
          <button type="button" className="btn btn-secondary" disabled={restoring} onClick={() => importInputRef.current?.click()}>
            <Icon name="uploadCloud" size={14} />
            {restoring ? 'Restoring…' : 'Import backup'}
          </button>
        </div>
      </div>

      <div className="card" style={{ gap: 10 }}>
        <div className="card-kicker">Setup</div>
        <div className="card-title">Flash your Raspberry Pi</div>
        <p className="card-body">
          Flash Raspberry Pi OS Lite with Raspberry Pi Imager (its gear-icon setup covers hostname, SSH, and your
          Wi-Fi SSID/password), then run the SignageMadeEasy provisioning script over SSH once. It boots straight
          into signage mode at 1920×1080 and shows its IP address and a pairing QR code on screen — pair it from here.
        </p>
        <a
          href="https://github.com/yusufmiahav/SignageMadeEasy/blob/main/pi-player/README.md"
          target="_blank"
          rel="noreferrer"
          className="btn btn-primary"
          style={{ alignSelf: 'flex-start' }}
        >
          Setup guide
        </a>
      </div>

      <div className="card" style={{ gap: 6 }}>
        <div className="card-kicker">About</div>
        <div className="card-title">SignageMadeEasy 1.0.0</div>
        <p className="card-body">
          {import.meta.env.VITE_API_BASE_URL !== undefined
            ? 'Connected to your SignageMadeEasy hub.'
            : 'Standalone mode — content is saved in this browser only. Deploy the hub to manage screens from any device on your network.'}
        </p>
        <p className="card-body text-muted" style={{ fontSize: 12 }}>Created by Yusuf Miah with Claude.</p>
        {authGateEnabled && (
          <button
            type="button"
            className="btn btn-secondary"
            style={{ alignSelf: 'flex-start', marginTop: 4 }}
            onClick={() => {
              void logout();
              onLogout();
            }}
          >
            Log out
          </button>
        )}
      </div>
    </div>
  );
}
