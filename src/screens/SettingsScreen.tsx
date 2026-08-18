import { useState } from 'react';
import { Icon } from '../components/icons/Icon';
import type { AppState } from '../hooks/useAppState';

interface SettingsScreenProps {
  app: AppState;
}

export function SettingsScreen({ app }: SettingsScreenProps) {
  const { groups, devices, renameGroup, deleteGroup } = app;
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');

  const startEdit = (id: string, name: string) => {
    setEditingGroupId(id);
    setEditingName(name);
  };
  const save = () => {
    if (editingGroupId) renameGroup(editingGroupId, editingName);
    setEditingGroupId(null);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <h1 style={{ margin: 0 }}>Settings</h1>

      <div className="card" style={{ gap: 8 }}>
        <div className="card-kicker">Locations</div>
        {groups.map((group) => {
          const count = devices.filter((d) => d.groupId === group.id).length;
          const isEditing = group.id === editingGroupId;
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
                <>
                  <span style={{ flex: 1, fontSize: 13 }}>{group.name}</span>
                  <span className="tag tag-neutral">{count} screen{count === 1 ? '' : 's'}</span>
                </>
              )}
              {isEditing ? (
                <button type="button" className="btn btn-secondary btn-icon" aria-label="Save" onClick={save}>
                  <Icon name="check" size={13} />
                </button>
              ) : (
                <>
                  <button type="button" className="btn btn-ghost btn-icon" aria-label="Rename" onClick={() => startEdit(group.id, group.name)}>
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
      </div>

      <div className="card" style={{ gap: 8 }}>
        <div className="card-kicker">Network</div>
        <div className="card-title">This computer's Wi-Fi</div>
        <p className="card-body">Screens must be on the same network to appear here.</p>
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
        <p className="card-body">Prototype build.</p>
      </div>
    </div>
  );
}
