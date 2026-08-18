import type { ReactNode } from 'react';
import { Icon } from '../icons/Icon';

interface DialogShellProps {
  title: string;
  onClose: () => void;
  children: ReactNode;
}

export function DialogShell({ title, onClose, children }: DialogShellProps) {
  return (
    <div className="dialog-backdrop" style={{ zIndex: 60 }} onClick={onClose}>
      <div className="dialog" onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span className="dialog-title">{title}</span>
          <button type="button" className="btn btn-ghost btn-icon" aria-label="Close" onClick={onClose}>
            <Icon name="x" size={16} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
