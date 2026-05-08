import { useEffect, useRef, type JSX } from 'react';

export function ConfirmModal({
  open, message, confirmLabel, cancelLabel, onConfirm, onCancel,
}: {
  open: boolean;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}): JSX.Element | null {
  const confirmBtnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    confirmBtnRef.current?.focus();
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', onKey);
    return (): void => window.removeEventListener('keydown', onKey);
  }, [open, onCancel]);

  if (!open) return null;

  return (
    <div
      className="confirm-modal__backdrop"
      onClick={onCancel}
      role="presentation"
    >
      <div
        className="confirm-modal__dialog"
        onClick={(e): void => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-modal-message"
      >
        <div id="confirm-modal-message" className="confirm-modal__message">{message}</div>
        <div className="confirm-modal__actions">
          <button type="button" className="btn btn-ghost" onClick={onCancel}>
            {cancelLabel ?? 'Cancel'}
          </button>
          <button
            ref={confirmBtnRef}
            type="button"
            className="btn btn-primary"
            onClick={onConfirm}
          >
            {confirmLabel ?? 'OK'}
          </button>
        </div>
      </div>
    </div>
  );
}
