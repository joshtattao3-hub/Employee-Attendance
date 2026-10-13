import { useEffect } from "react";
import { CheckCircleIcon, AlertCircleIcon, CloseIcon } from "./Icons";

const DISMISS_AFTER_MS = 4000;

function Toast({ message, onDismiss }) {
  // Start a countdown whenever a new message appears
  useEffect(() => {
    if (!message) return;
    const id = setTimeout(onDismiss, DISMISS_AFTER_MS);
    return () => clearTimeout(id); // cancel if replaced or closed early
  }, [message, onDismiss]);

  const isError = message?.type === "error";
  const ToastIcon = isError ? AlertCircleIcon : CheckCircleIcon;

  return (
    // The container is always in the page so screen readers announce new toasts
    <div className="toast-region" aria-live="polite">
      {message && (
        <div className={`toast toast--${message.type}`}>
          <span className="toast__icon">
            <ToastIcon size={20} />
          </span>
          <div className="toast__body">
            <p className="toast__title">
              {isError ? "Action not allowed" : "Success"}
            </p>
            <p className="toast__text">{message.text}</p>
          </div>
          <button
            type="button"
            className="icon-btn toast__close"
            onClick={onDismiss}
            aria-label="Dismiss notification"
          >
            <CloseIcon size={16} />
          </button>
        </div>
      )}
    </div>
  );
}

export default Toast;