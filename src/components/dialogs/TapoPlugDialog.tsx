import { useState } from 'react';
import { DialogShell } from './DialogShell';
import { Icon } from '../icons/Icon';
import type { AppState } from '../../hooks/useAppState';
import type { Device } from '../../api/types';

// 0=Sunday..6=Saturday, matching PowerSchedule.daysOfWeek/JS Date.getDay() — same
// Mon-first display order as AddEventDialog.tsx's own WEEKDAYS for the same reason
// (a work-week pattern reads more naturally starting on Monday).
const WEEKDAYS: { value: number; label: string }[] = [
  { value: 1, label: 'Mon' }, { value: 2, label: 'Tue' }, { value: 3, label: 'Wed' }, { value: 4, label: 'Thu' },
  { value: 5, label: 'Fri' }, { value: 6, label: 'Sat' }, { value: 0, label: 'Sun' },
];

function daysLabel(daysOfWeek: number[] | undefined): string {
  if (!daysOfWeek || daysOfWeek.length === 0) return 'Every day';
  if (daysOfWeek.length === 5 && [1, 2, 3, 4, 5].every((d) => daysOfWeek.includes(d))) return 'Weekdays';
  if (daysOfWeek.length === 2 && [0, 6].every((d) => daysOfWeek.includes(d))) return 'Weekends';
  return WEEKDAYS.filter((d) => daysOfWeek.includes(d.value)).map((d) => d.label).join(', ');
}

interface TapoPlugDialogProps {
  app: AppState;
  device: Device;
  onClose: () => void;
}

/**
 * One screen's TP-Link Tapo smart plug: where to find it (IP), a manual hard
 * power-cycle, and its own recurring on/off schedule — everything else about a Tapo
 * plug (the shared account that actually authenticates to it) lives in Settings'
 * own "Tapo smart plugs" card instead, since that's one account for every screen,
 * not a per-device setting. Reachable from the power icon on each screen's row.
 */
export function TapoPlugDialog({ app, device, onClose }: TapoPlugDialogProps) {
  const { tapoConfigured, setDeviceTapoPlugIp, tapoPowerCycle, addDevicePowerSchedule, removeDevicePowerSchedule, showToast } = app;
  const [ipDraft, setIpDraft] = useState(device.tapoPlugIp ?? '');
  const [cycling, setCycling] = useState(false);
  const [days, setDays] = useState<Set<number>>(new Set());
  const [onTime, setOnTime] = useState('08:00');
  const [offTime, setOffTime] = useState('20:00');
  const [adding, setAdding] = useState(false);

  const saveIp = async () => {
    const trimmed = ipDraft.trim();
    await setDeviceTapoPlugIp(device.id, trimmed || null);
    showToast(trimmed ? `Plug IP saved for ${device.name}` : `Plug removed from ${device.name}`);
  };

  const toggleDay = (value: number) => {
    setDays((prev) => {
      const next = new Set(prev);
      if (next.has(value)) next.delete(value); else next.add(value);
      return next;
    });
  };

  const addSchedule = async () => {
    if (!onTime || !offTime) return;
    setAdding(true);
    try {
      await addDevicePowerSchedule(device.id, { onTime, offTime, daysOfWeek: days.size > 0 ? Array.from(days) : undefined });
      setDays(new Set());
      showToast('Power schedule added');
    } finally {
      setAdding(false);
    }
  };

  const cycle = async () => {
    setCycling(true);
    try {
      await tapoPowerCycle(device);
    } finally {
      setCycling(false);
    }
  };

  return (
    <DialogShell title={`Tapo plug: ${device.name}`} onClose={onClose}>
      {!tapoConfigured && (
        <div className="dialog-warning">
          <Icon name="alertTriangle" size={16} />
          <span>No Tapo account configured yet — add one in Settings' "Tapo smart plugs" section before a plug IP here can actually be controlled.</span>
        </div>
      )}
      <div className="field">
        <label htmlFor="tapo-ip">Plug IP address</label>
        <div style={{ display: 'flex', gap: 6 }}>
          <input
            className="input"
            id="tapo-ip"
            placeholder="e.g. 192.168.1.42"
            value={ipDraft}
            onChange={(e) => setIpDraft(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && void saveIp()}
            style={{ flex: 1 }}
          />
          <button type="button" className="btn btn-secondary" onClick={() => void saveIp()}>Save</button>
        </div>
        <p className="text-muted" style={{ fontSize: 11, margin: '4px 0 0' }}>
          On the same LAN as the hub — the hub reaches it directly, the same way it reaches this screen's own Pi.
        </p>
      </div>

      <button
        type="button"
        className="btn btn-secondary btn-block"
        disabled={!device.tapoPlugIp || cycling}
        title={device.tapoPlugIp ? 'Turns the plug off, pauses, then back on' : 'Save a plug IP above first'}
        onClick={() => void cycle()}
      >
        <Icon name="zap" size={14} />
        {cycling ? 'Power cycling…' : 'Power cycle now'}
      </button>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <h2 style={{ margin: 0, fontSize: 13, textTransform: 'uppercase', letterSpacing: '0.06em', opacity: 0.6 }}>Power schedule</h2>
        {device.powerSchedules.length === 0 ? (
          <p className="text-muted" style={{ margin: 0, fontSize: 13 }}>No automatic schedule — the plug only ever changes via "Power cycle now" above.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {device.powerSchedules.map((s) => (
              <div key={s.id} className="card" style={{ flexDirection: 'row', alignItems: 'center', gap: 8, padding: '8px 10px' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{s.onTime} – {s.offTime}</div>
                  <div className="text-muted" style={{ fontSize: 11 }}>{daysLabel(s.daysOfWeek)}</div>
                </div>
                <button type="button" className="btn btn-ghost btn-icon" aria-label="Remove schedule" onClick={() => void removeDevicePowerSchedule(device.id, s.id)}>
                  <Icon name="trash" size={13} />
                </button>
              </div>
            ))}
          </div>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, border: '1px solid var(--color-divider)', borderRadius: 8, padding: 10 }}>
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            {WEEKDAYS.map((d) => (
              <button
                key={d.value}
                type="button"
                className={days.has(d.value) ? 'btn btn-primary' : 'btn btn-secondary'}
                style={{ fontSize: 12, padding: '4px 10px' }}
                onClick={() => toggleDay(d.value)}
              >
                {d.label}
              </button>
            ))}
          </div>
          <p className="text-muted" style={{ fontSize: 11, margin: 0 }}>Leave every day unselected for "every day" — same as above.</p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div className="field">
              <label htmlFor="tapo-on">On at</label>
              <input className="input" id="tapo-on" type="time" value={onTime} onChange={(e) => setOnTime(e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="tapo-off">Off at</label>
              <input className="input" id="tapo-off" type="time" value={offTime} onChange={(e) => setOffTime(e.target.value)} />
            </div>
          </div>
          <button type="button" className="btn btn-secondary btn-block" disabled={adding} onClick={() => void addSchedule()}>
            {adding ? 'Adding…' : 'Add schedule'}
          </button>
        </div>
      </div>

      <div className="dialog-actions">
        <button type="button" className="btn btn-primary" onClick={onClose}>Done</button>
      </div>
    </DialogShell>
  );
}
