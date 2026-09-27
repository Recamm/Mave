import { useEffect, useRef, useState, type ReactNode } from 'react';
import { X } from 'lucide-react';

type FullPageFormDialogProps = {
  children: (closeDialog: () => void) => ReactNode;
  dialogLabel: string;
  triggerLabel: string;
  triggerClassName?: string;
};

export function FullPageFormDialog({
  children,
  dialogLabel,
  triggerLabel,
  triggerClassName,
}: FullPageFormDialogProps) {
  const [isOpen, setIsOpen] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (isOpen && dialog && !dialog.open) {
      dialog.showModal();
    }
  }, [isOpen]);

  function closeDialog() {
    dialogRef.current?.close();
    setIsOpen(false);
  }

  return (
    <>
      <button
        aria-haspopup="dialog"
        className={triggerClassName}
        onClick={() => setIsOpen(true)}
        type="button"
      >
        {triggerLabel}
      </button>
      {isOpen ? (
        <dialog
          aria-label={dialogLabel}
          className="full-page-form-dialog"
          onCancel={(event) => {
            event.preventDefault();
            closeDialog();
          }}
          onClose={() => setIsOpen(false)}
          ref={dialogRef}
        >
          <button
            aria-label="Cerrar formulario"
            autoFocus
            className="full-page-form-dialog__close"
            onClick={closeDialog}
            title="Cerrar formulario"
            type="button"
          >
            <X aria-hidden="true" size={20} />
          </button>
          <div className="full-page-form-dialog__content">{children(closeDialog)}</div>
        </dialog>
      ) : null}
    </>
  );
}
