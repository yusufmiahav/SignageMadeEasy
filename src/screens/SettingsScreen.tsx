import { useRef, useState } from 'react';
import { Icon } from '../components/icons/Icon';
import type { AppState } from '../hooks/useAppState';
import type { Theme } from '../hooks/useTheme';
import type { Backup, Device, Group } from '../api/types';
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
  const {
    groups, devices, locations, renameGroup, deleteGroup, setGroupLocation, renameDevice, removeDevice, setDeviceLocation,
    reorderDevices, moveDevice, addGroup, addLocation, renameLocation, deleteLocation, reorderLocations, showToast, exportBackup, importBackup,
    safetyHold, setSafetyHold, flashDevice,
  } = app;
  const [editing, setEditing] = useState<{ id: string; kind: 'group' | 'device' | 'location' } | null>(null);
  const [editingName, setEditingName] = useState('');
  // Groups/screens filed under a Location render inside that Location's own section
  // below instead of at the top level — same split as HomeScreen.tsx. A locationId
  // pointing at a since-deleted Location (e.g. a hand-edited backup import) is
  // treated as unfiled too, so it doesn't silently disappear from both buckets.
  const locationIds = new Set(locations.map((l) => l.id));
  const isUnfiled = (locationId: string | null) => !locationId || !locationIds.has(locationId);
  const topLevelGroups = groups.filter((g) => isUnfiled(g.locationId));
  const fullyUnassignedDevices = devices.filter((d) => !d.groupId && isUnfiled(d.locationId));
  const [restoring, setRestoring] = useState(false);
  const importInputRef = useRef<HTMLInputElement>(null);
  const [newLocationName, setNewLocationName] = useState('');
  const addNewLocation = async () => {
    if (!newLocationName.trim()) return;
    const location = await addLocation(newLocationName);
    showToast(`Added ${location.name}`);
    setNewLocationName('');
  };
  const moveLocation = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= locations.length) return;
    const reordered = [...locations];
    [reordered[index], reordered[target]] = [reordered[target], reordered[index]];
    void reorderLocations(reordered.map((l) => l.id));
  };

  // Batch-move: select screens across any group (or the fully-unassigned list) and
  // move them all to one target at once — same underlying moveDevice as the
  // single-screen move arrows/dialog, just applied to the whole selection in one go.
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [moveTarget, setMoveTarget] = useState('');
  const [newGroupName, setNewGroupName] = useState('');
  const isNewGroupTarget = moveTarget === '__new__';
  // Separate batch action from the group move above — filing several screens under
  // one Location at once is the main "import multiple screens onto a location" use
  // case, and is independent of which group (if any) each one is in.
  const [locationTarget, setLocationTarget] = useState('');

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  const exitSelectMode = () => {
    setSelectMode(false);
    setSelectedIds(new Set());
    setMoveTarget('');
    setNewGroupName('');
    setLocationTarget('');
  };
  const moveSelected = async () => {
    if (!moveTarget) return;
    let targetId: string | null = moveTarget === '__none__' ? null : moveTarget;
    if (isNewGroupTarget) {
      if (!newGroupName.trim()) return;
      const group = await addGroup(newGroupName);
      targetId = group.id;
    }
    const ids = [...selectedIds];
    await Promise.all(ids.map((id) => moveDevice(id, targetId)));
    showToast(`Moved ${ids.length} screen${ids.length === 1 ? '' : 's'}`);
    exitSelectMode();
  };
  const fileSelectedInLocation = async () => {
    if (!locationTarget) return;
    const targetId = locationTarget === '__none__' ? null : locationTarget;
    const ids = [...selectedIds];
    await Promise.all(ids.map((id) => setDeviceLocation(id, targetId)));
    showToast(`Filed ${ids.length} screen${ids.length === 1 ? '' : 's'}`);
    exitSelectMode();
  };

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

  const startEdit = (id: string, name: string, kind: 'group' | 'device' | 'location') => {
    setEditing({ id, kind });
    setEditingName(name);
  };
  const save = () => {
    if (editing) {
      if (editing.kind === 'group') renameGroup(editing.id, editingName);
      else if (editing.kind === 'location') void renameLocation(editing.id, editingName);
      else renameDevice(editing.id, editingName);
    }
    setEditing(null);
  };

  // `scopeDevices` is one group's (or the fully-unassigned list's) screens in their
  // current display order — reorderDevices expects the complete reordered set for
  // that one scope, so this swaps within the scope's own id list and sends the whole
  // thing back.
  const moveDeviceInScope = (scopeDevices: Device[], deviceId: string, direction: 'up' | 'down') => {
    const idx = scopeDevices.findIndex((d) => d.id === deviceId);
    const swapWith = direction === 'up' ? idx - 1 : idx + 1;
    if (idx < 0 || swapWith < 0 || swapWith >= scopeDevices.length) return;
    const ids = scopeDevices.map((d) => d.id);
    [ids[idx], ids[swapWith]] = [ids[swapWith], ids[idx]];
    void reorderDevices(ids);
  };

  // Shared row renderer for a screen nested under its group (or the fully-unassigned
  // list) — `scope` is that one group's/list's screens in display order, used both to
  // know whether the up/down arrows are at a boundary and as the reorder payload.
  // `showLocationPicker` only applies to a standalone screen (no group of its own) —
  // a grouped screen's location comes from its group instead, see Device.locationId.
  const renderScreenRow = (device: Device, scope: Device[], idx: number, showLocationPicker = false) => {
    const isEditing = editing?.kind === 'device' && editing.id === device.id;
    return (
      <div
        key={device.id}
        style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0 4px 20px', borderTop: '1px solid var(--color-divider)', flexWrap: 'wrap' }}
      >
        {selectMode && (
          <input
            type="checkbox"
            aria-label={`Select ${device.name}`}
            checked={selectedIds.has(device.id)}
            onChange={() => toggleSelect(device.id)}
          />
        )}
        {isEditing ? (
          <input
            className="input"
            style={{ flex: '1 1 140px' }}
            value={editingName}
            onChange={(e) => setEditingName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && save()}
            autoFocus
          />
        ) : (
          // A fixed flex-basis (rather than plain flex: 1) so a narrow row wraps this
          // whole name block onto its own line instead of squeezing it thin enough
          // that the device's own name wraps mid-word around the trailing controls.
          <div style={{ flex: '1 1 140px' }}>
            <div style={{ fontSize: 13 }}>{device.name}</div>
            <div className="text-muted" style={{ fontSize: 11 }}>Screen</div>
          </div>
        )}
        {showLocationPicker && !selectMode && !isEditing && (
          <select
            className="input"
            style={{ width: 'auto', fontSize: 11, padding: '2px 4px' }}
            value={device.locationId ?? ''}
            onChange={(e) => void setDeviceLocation(device.id, e.target.value || null)}
            aria-label={`Location for ${device.name}`}
          >
            <option value="">No location</option>
            {locations.map((l) => (
              <option key={l.id} value={l.id}>{l.name}</option>
            ))}
          </select>
        )}
        {selectMode ? null : isEditing ? (
          <button type="button" className="btn btn-secondary btn-icon" aria-label="Save" onClick={save}>
            <Icon name="check" size={13} />
          </button>
        ) : (
          <>
            <button
              type="button"
              className="btn btn-ghost btn-icon"
              aria-label="Move up"
              disabled={idx === 0}
              onClick={() => moveDeviceInScope(scope, device.id, 'up')}
            >
              <Icon name="chevronUp" size={13} />
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-icon"
              aria-label="Move down"
              disabled={idx === scope.length - 1}
              onClick={() => moveDeviceInScope(scope, device.id, 'down')}
            >
              <Icon name="chevronDown" size={13} />
            </button>
            <button type="button" className="btn btn-ghost btn-icon" aria-label="Identify" title="Blink this screen's display" onClick={() => void flashDevice(device)}>
              <Icon name="lightbulb" size={13} />
            </button>
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
  };

  // Shared row renderer for a group, nested under its Location (or top-level) — shows
  // its own screens via renderScreenRow and a Location picker to file/refile it.
  const renderGroupRow = (group: Group) => {
    const screens = devices.filter((d) => d.groupId === group.id);
    const isEditing = editing?.kind === 'group' && editing.id === group.id;
    const cannotDelete = screens.length > 0;
    return (
      <div key={group.id}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', flexWrap: 'wrap' }}>
          {isEditing ? (
            <input
              className="input"
              style={{ flex: '1 1 140px' }}
              value={editingName}
              onChange={(e) => setEditingName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && save()}
              autoFocus
            />
          ) : (
            // A fixed flex-basis (rather than plain flex: 1) so a narrow row wraps this
            // whole name block onto its own line instead of squeezing it thin enough
            // that the group's own name wraps mid-word around the trailing controls.
            <div style={{ flex: '1 1 140px' }}>
              <div style={{ fontSize: 13 }}>{group.name}</div>
              <div className="text-muted" style={{ fontSize: 11 }}>Group</div>
            </div>
          )}
          {!isEditing && <span className="tag tag-neutral">{screens.length} screen{screens.length === 1 ? '' : 's'}</span>}
          {!isEditing && locations.length > 0 && (
            <select
              className="input"
              style={{ width: 'auto', fontSize: 11, padding: '2px 4px' }}
              value={group.locationId ?? ''}
              onChange={(e) => void setGroupLocation(group.id, e.target.value || null)}
              aria-label={`Location for ${group.name}`}
            >
              <option value="">No location</option>
              {locations.map((l) => (
                <option key={l.id} value={l.id}>{l.name}</option>
              ))}
            </select>
          )}
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
                title={cannotDelete ? 'Remove its screens first' : 'Delete group'}
                onClick={() => deleteGroup(group.id)}
              >
                <Icon name="trash" size={13} />
              </button>
            </>
          )}
        </div>
        {screens.map((device, idx) => renderScreenRow(device, screens, idx))}
      </div>
    );
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
        <div className="card-kicker">Locations</div>
        <p className="card-body" style={{ margin: 0 }}>
          Purely organizational areas for browsing/managing a whole site at once — e.g. "Warehouse
          Building". A location has no content of its own: file groups and/or standalone screens
          under it below.
        </p>
        {locations.map((location, index) => {
          const isEditing = editing?.kind === 'location' && editing.id === location.id;
          const count = groups.filter((g) => g.locationId === location.id).length + devices.filter((d) => !d.groupId && d.locationId === location.id).length;
          return (
            <div key={location.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', borderTop: '1px solid var(--color-divider)', flexWrap: 'wrap' }}>
              {isEditing ? (
                <input
                  className="input"
                  style={{ flex: '1 1 140px' }}
                  value={editingName}
                  onChange={(e) => setEditingName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && save()}
                  autoFocus
                />
              ) : (
                <div style={{ flex: '1 1 140px', fontSize: 13 }}>{location.name}</div>
              )}
              {!isEditing && <span className="tag tag-neutral">{count} item{count === 1 ? '' : 's'}</span>}
              {isEditing ? (
                <button type="button" className="btn btn-secondary btn-icon" aria-label="Save" onClick={save}>
                  <Icon name="check" size={13} />
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    className="btn btn-ghost btn-icon"
                    aria-label="Move up"
                    disabled={index === 0}
                    onClick={() => moveLocation(index, -1)}
                  >
                    <Icon name="chevronUp" size={13} />
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost btn-icon"
                    aria-label="Move down"
                    disabled={index === locations.length - 1}
                    onClick={() => moveLocation(index, 1)}
                  >
                    <Icon name="chevronDown" size={13} />
                  </button>
                  <button type="button" className="btn btn-ghost btn-icon" aria-label="Rename" onClick={() => startEdit(location.id, location.name, 'location')}>
                    <Icon name="pencil" size={13} />
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost btn-icon"
                    aria-label="Delete"
                    title="Delete location — its groups/screens are kept, just un-filed"
                    onClick={() => void deleteLocation(location.id)}
                  >
                    <Icon name="trash" size={13} />
                  </button>
                </>
              )}
            </div>
          );
        })}
        <div style={{ display: 'flex', gap: 8, paddingTop: locations.length > 0 ? 4 : 0 }}>
          <input
            className="input"
            style={{ flex: 1 }}
            placeholder="e.g. Reception"
            value={newLocationName}
            onChange={(e) => setNewLocationName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && void addNewLocation()}
          />
          <button type="button" className="btn btn-secondary" disabled={!newLocationName.trim()} onClick={() => void addNewLocation()}>
            Add location
          </button>
        </div>
      </div>

      <div className="card" style={{ gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div className="card-kicker">Groups & Screens</div>
          {devices.length > 1 && (
            <button
              type="button"
              className="btn btn-secondary"
              style={{ fontSize: 12, padding: '4px 8px' }}
              onClick={() => (selectMode ? exitSelectMode() : setSelectMode(true))}
            >
              {selectMode ? 'Cancel select' : 'Select screens'}
            </button>
          )}
        </div>

        {selectMode && (
          <div className="select-toolbar">
            <span style={{ fontSize: 13 }}>{selectedIds.size} selected</span>
            <button
              type="button"
              className="btn btn-ghost"
              style={{ fontSize: 12 }}
              onClick={() => setSelectedIds(new Set(devices.map((d) => d.id)))}
            >
              Select all
            </button>
            <select
              className="input"
              style={{ width: 'auto', fontSize: 12 }}
              value={moveTarget}
              onChange={(e) => setMoveTarget(e.target.value)}
              aria-label="Move selected screens to"
            >
              <option value="" disabled>Move to…</option>
              <option value="__none__">No group</option>
              {groups.map((g) => (
                <option key={g.id} value={g.id}>{g.name}</option>
              ))}
              <option value="__new__">+ New group</option>
            </select>
            {isNewGroupTarget && (
              <input
                className="input"
                style={{ width: 140, fontSize: 12 }}
                placeholder="e.g. Lobby screens"
                value={newGroupName}
                onChange={(e) => setNewGroupName(e.target.value)}
                autoFocus
              />
            )}
            <button
              type="button"
              className="btn btn-secondary"
              style={{ fontSize: 12 }}
              disabled={selectedIds.size === 0 || !moveTarget || (isNewGroupTarget && !newGroupName.trim())}
              onClick={() => void moveSelected()}
            >
              Move
            </button>
            {locations.length > 0 && (
              <>
                <select
                  className="input"
                  style={{ width: 'auto', fontSize: 12 }}
                  value={locationTarget}
                  onChange={(e) => setLocationTarget(e.target.value)}
                  aria-label="File selected screens in location"
                >
                  <option value="" disabled>File in location…</option>
                  <option value="__none__">No location</option>
                  {locations.map((l) => (
                    <option key={l.id} value={l.id}>{l.name}</option>
                  ))}
                </select>
                <button
                  type="button"
                  className="btn btn-secondary"
                  style={{ fontSize: 12 }}
                  disabled={selectedIds.size === 0 || !locationTarget}
                  onClick={() => void fileSelectedInLocation()}
                >
                  File
                </button>
              </>
            )}
          </div>
        )}

        {locations.map((location) => {
          const locationGroups = groups.filter((g) => g.locationId === location.id);
          const locationDevices = devices.filter((d) => !d.groupId && d.locationId === location.id);
          if (locationGroups.length === 0 && locationDevices.length === 0) return null;
          return (
            <div key={location.id} style={{ padding: '6px 0 6px 8px', borderLeft: '2px solid var(--color-divider)' }}>
              <div className="text-muted" style={{ fontSize: 11, display: 'flex', alignItems: 'center', gap: 4 }}>
                <Icon name="mapPin" size={11} /> {location.name}
              </div>
              {locationGroups.map((group) => renderGroupRow(group))}
              {locationDevices.length > 0 && (
                <>
                  {/* renderScreenRow always indents as if nested under the group row
                      above it — without this label, a standalone screen filed directly
                      under this Location (sitting right after a group's own rows) reads
                      as though it belongs to that group instead of being its sibling. */}
                  <div className="text-muted" style={{ fontSize: 11, padding: '4px 0 0 20px' }}>Standalone screens</div>
                  {locationDevices.map((device, idx) => renderScreenRow(device, locationDevices, idx, true))}
                </>
              )}
            </div>
          );
        })}
        {topLevelGroups.map((group) => renderGroupRow(group))}
        {fullyUnassignedDevices.length > 0 && (
          <div>
            <div style={{ padding: '4px 0' }}>
              <div className="text-muted" style={{ fontSize: 11 }}>No group</div>
            </div>
            {fullyUnassignedDevices.map((device, idx) => renderScreenRow(device, fullyUnassignedDevices, idx, true))}
          </div>
        )}
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
