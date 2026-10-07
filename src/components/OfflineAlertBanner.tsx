import { useEffect, useState } from 'react';
import { Icon } from './icons/Icon';
import type { Device } from '../api/types';

interface OfflineAlertBannerProps {
  devices: Device[];
  /** Settings screen's "Alert when offline for more than N minutes" — see hub/src/store.ts's getOfflineAlertMinutes. 0 turns this off entirely. */
  thresholdMinutes: number;
  /** Permanently excludes/re-includes a screen from this alert — see Device.offlineAlertsMuted. Unlike Dismiss below, this survives the screen recovering and dropping again; a muted screen can still be unmuted later from Settings' "Muted screens" list. */
  onSetMuted: (deviceId: string, muted: boolean, deviceName: string) => void;
}

// Shown on every tab (see AppShell.tsx) whenever a screen has been offline longer
// than the configured threshold — the existing "went offline" toast (useAppState.ts's
// refreshDevices) only fires once, at the moment of the transition, and fades within
// seconds, so it's easy to miss if nobody's looking right then. This instead stays up
// for as long as the outage does, per screen, with a Dismiss (temporary) and a Mute
// (permanent — see Device.offlineAlertsMuted) action on each one.
export function OfflineAlertBanner({ devices, thresholdMinutes, onSetMuted }: OfflineAlertBannerProps) {
  // Dismissing hides exactly the screen it's clicked on, not alerting in general —
  // one that recovers and later drops again should still get a fresh alert, so its
  // id is dropped from this set the moment it's back online (the effect below)
  // rather than staying silenced forever. Muting (a persisted Device field, not this
  // local state) is the permanent version of the same action.
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  useEffect(() => {
    const onlineIds = devices.filter((d) => d.status === 'online').map((d) => d.id);
    if (onlineIds.length === 0) return;
    setDismissed((prev) => {
      if (!onlineIds.some((id) => prev.has(id))) return prev;
      const next = new Set(prev);
      onlineIds.forEach((id) => next.delete(id));
      return next;
    });
  }, [devices]);

  if (thresholdMinutes <= 0) return null;

  const thresholdMs = thresholdMinutes * 60_000;
  const now = Date.now();
  // lastSeenAt == null means never once heard from (never paired properly, or
  // offline since before this shipped) rather than a screen that WAS seen and then
  // went quiet — Home's own status dot already flags that case clearly enough on
  // its own, so it's left out of this specifically "gone quiet" alert.
  const overdue = devices.filter(
    (d) => d.status === 'offline' && !d.offlineAlertsMuted && d.lastSeenAt != null && now - d.lastSeenAt >= thresholdMs && !dismissed.has(d.id),
  );
  if (overdue.length === 0) return null;

  return (
    <div className="dialog-warning" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 6, marginBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <Icon name="alertTriangle" size={16} />
        <span style={{ flex: 1 }}>
          {overdue.length === 1
            ? `1 screen has been offline for over ${thresholdMinutes} minute${thresholdMinutes === 1 ? '' : 's'}.`
            : `${overdue.length} screens have been offline for over ${thresholdMinutes} minutes.`}
        </span>
      </div>
      {overdue.map((d) => (
        <div key={d.id} style={{ display: 'flex', alignItems: 'center', gap: 8, paddingLeft: 24 }}>
          <span style={{ flex: 1, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.name}</span>
          <button
            type="button"
            className="btn btn-ghost"
            style={{ fontSize: 12, padding: '2px 8px', flexShrink: 0 }}
            title="Stop alerting for this screen until it comes back online and drops again"
            onClick={() => setDismissed((prev) => new Set([...prev, d.id]))}
          >
            Dismiss
          </button>
          <button
            type="button"
            className="btn btn-ghost"
            style={{ fontSize: 12, padding: '2px 8px', flexShrink: 0 }}
            title="Stop alerting for this screen entirely, until you unmute it in Settings"
            onClick={() => onSetMuted(d.id, true, d.name)}
          >
            Mute
          </button>
        </div>
      ))}
    </div>
  );
}
