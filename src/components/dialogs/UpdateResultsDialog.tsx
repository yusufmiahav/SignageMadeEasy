import { DialogShell } from './DialogShell';
import { Icon } from '../icons/Icon';
import type { UpdateResult } from '../../hooks/useAppState';

interface UpdateResultsDialogProps {
  results: UpdateResult[];
  /** 'update' (the default) for the fast app-only path, 'reprovision' for the full re-provision-and-reboot path, 'restart' for a plain reboot — just changes the wording below, same shape otherwise. */
  kind?: 'update' | 'reprovision' | 'restart';
  onClose: () => void;
}

// Titled/worded as a trigger report, not a completion report — this dialog fires
// the instant every request has been sent, long before any screen could actually
// be done. A checkmark/"results" framing here previously read as "all finished,"
// which isn't true even in the all-succeeded case: real completion is tracked
// separately, per screen, in Settings' own device rows (an "Updating…" badge
// until the hub sees proof it restarted) and the Update log below it.
const COPY = {
  update: { title: 'Update triggered', verb: 'updating', extra: '' },
  reprovision: { title: 'Re-provision triggered', verb: 're-provisioning', extra: ', longer with the reboot at the end' },
  restart: { title: 'Restart triggered', verb: 'restarting', extra: '' },
};

export function UpdateResultsDialog({ results, kind = 'update', onClose }: UpdateResultsDialogProps) {
  const succeeded = results.filter((r) => !r.error);
  const failed = results.filter((r) => r.error);
  const { title, verb, extra } = COPY[kind];

  return (
    <DialogShell title={title} onClose={onClose}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <p className="text-muted" style={{ margin: 0, fontSize: 13 }}>
          {failed.length === 0
            ? `${verb[0].toUpperCase()}${verb.slice(1)} started on all ${succeeded.length} screen${succeeded.length === 1 ? '' : 's'} — this can take up to a minute per screen${extra}. Track each one's actual progress in Settings below, or the Update log.`
            : `${verb[0].toUpperCase()}${verb.slice(1)} started on ${succeeded.length} of ${results.length} screen${results.length === 1 ? '' : 's'}; ${failed.length} couldn't be reached at all.`}
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {results.map((r) => (
            <div key={r.device.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '8px 0', borderBottom: '1px solid var(--color-divider)' }}>
              <Icon
                name={r.error ? 'x' : 'clock'}
                size={14}
                style={{ color: r.error ? 'var(--color-danger, #c0392b)' : 'var(--color-accent-800)', marginTop: 2, flexShrink: 0 }}
              />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{r.device.name}</div>
                <div style={{ fontSize: 12, color: r.error ? 'var(--color-danger, #c0392b)' : undefined }} className={r.error ? undefined : 'text-muted'}>
                  {r.error ?? 'Started — not finished yet'}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </DialogShell>
  );
}
