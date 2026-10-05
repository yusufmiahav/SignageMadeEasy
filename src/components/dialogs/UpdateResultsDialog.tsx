import { DialogShell } from './DialogShell';
import { Icon } from '../icons/Icon';
import type { UpdateResult } from '../../hooks/useAppState';

interface UpdateResultsDialogProps {
  results: UpdateResult[];
  /** 'update' (the default) for the fast app-only path, 'reprovision' for the full re-provision-and-reboot path, 'restart' for a plain reboot — just changes the wording below, same shape otherwise. */
  kind?: 'update' | 'reprovision' | 'restart';
  onClose: () => void;
}

const COPY = {
  update: { title: 'Update results', verb: 'updating', extra: '' },
  reprovision: { title: 'Re-provision results', verb: 're-provisioning', extra: ', longer with the reboot at the end' },
  restart: { title: 'Restart results', verb: 'restarting', extra: '' },
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
            ? `All ${succeeded.length} screen${succeeded.length === 1 ? '' : 's'} started ${verb} — this can take up to a minute per screen${extra}.`
            : `${succeeded.length} of ${results.length} screen${results.length === 1 ? '' : 's'} started ${verb}; ${failed.length} couldn't.`}
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {results.map((r) => (
            <div key={r.device.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '8px 0', borderBottom: '1px solid var(--color-divider)' }}>
              <Icon
                name={r.error ? 'x' : 'check'}
                size={14}
                style={{ color: r.error ? 'var(--color-danger, #c0392b)' : undefined, marginTop: 2, flexShrink: 0 }}
              />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{r.device.name}</div>
                {r.error && (
                  <div style={{ fontSize: 12, color: 'var(--color-danger, #c0392b)' }}>{r.error}</div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </DialogShell>
  );
}
