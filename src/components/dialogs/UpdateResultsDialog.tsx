import { DialogShell } from './DialogShell';
import { Icon } from '../icons/Icon';
import type { UpdateResult } from '../../hooks/useAppState';

interface UpdateResultsDialogProps {
  results: UpdateResult[];
  onClose: () => void;
}

export function UpdateResultsDialog({ results, onClose }: UpdateResultsDialogProps) {
  const succeeded = results.filter((r) => !r.error);
  const failed = results.filter((r) => r.error);

  return (
    <DialogShell title="Update results" onClose={onClose}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <p className="text-muted" style={{ margin: 0, fontSize: 13 }}>
          {failed.length === 0
            ? `All ${succeeded.length} screen${succeeded.length === 1 ? '' : 's'} started updating — this can take up to a minute per screen.`
            : `${succeeded.length} of ${results.length} screen${results.length === 1 ? '' : 's'} started updating; ${failed.length} couldn't.`}
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
