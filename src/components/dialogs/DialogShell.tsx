import { useEffect, type ReactNode } from 'react';
import { Icon } from '../icons/Icon';

interface DialogShellProps {
  title: string;
  onClose: () => void;
  children: ReactNode;
}

export function DialogShell({ title, onClose, children }: DialogShellProps) {
  // Every dialog in the app renders through this shell, so this one listener covers
  // all of them — only one dialog is ever open at a time (see App.tsx's single
  // DialogState), so there's no stacking order to worry about.
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return (
    <div className="dialog-backdrop" style={{ zIndex: 60 }} onClick={onClose}>
      <div className="dialog" onClick={(e) => e.stopPropagation()}>
        {/* Kept OUTSIDE .dialog-body-scroll (not just the first thing inside a single
            scrolling .dialog) so the title and close button stay put and reachable
            while a long dialog's body scrolls underneath them — e.g.
            ForceContentDialog's folder/item picker, which can run well past a short
            mobile viewport's height on its own. See modernist.css's .dialog comment
            for the bug this fixes: without a scroll boundary ANYWHERE in a dialog,
            content past the viewport edge (routinely the Cancel/Apply buttons
            standard DialogShell.tsx-styled calling code puts in dialog-actions) was
            simply unreachable, not just visually cut off. */}
        <div className="dialog-header">
          <span className="dialog-title">{title}</span>
          <button type="button" className="btn btn-ghost btn-icon" aria-label="Close" onClick={onClose}>
            <Icon name="x" size={16} />
          </button>
        </div>
        <div className="dialog-body-scroll">
          {children}
        </div>
      </div>
    </div>
  );
}
