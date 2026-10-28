import { useEffect, useId, useRef } from "react";
import { CloseIcon } from "./Icons";

// Wraps the native <dialog>: focus trap, Escape to close, and focus
// restore come built in. Content mounts only while open, so forms reset.
function Modal({ open, title, onClose, dismissible = true, children }) {
  const dialogRef = useRef(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
      dialog.querySelector("[data-autofocus]")?.focus();
    }
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={dialogRef}
      className="modal"
      aria-labelledby={titleId}
      onCancel={(e) => {
        // Escape key: block it while busy
        if (!dismissible) e.preventDefault();
      }}
      onClose={() => {
        // Safety net: if the browser closed it anyway while busy, reopen it
        if (open && !dismissible) {
          dialogRef.current?.showModal();
          return;
        }
        onClose();
      }}
      onClick={(e) => {
        // A click on the dark backdrop targets the dialog element itself
        if (dismissible && e.target === dialogRef.current) onClose();
      }}
    >
      {open && (
        <div className="modal__panel">
          <div className="modal__header">
            <h2 id={titleId} className="modal__title">
              {title}
            </h2>
            {dismissible && (
            <button
              type="button"
              className="icon-btn"
              onClick={onClose}
              aria-label="Close dialog"
            >
              <CloseIcon size={18} />
            </button>
            )}
          </div>
          {children}
        </div>
      )}
    </dialog>
  );
}

export default Modal;