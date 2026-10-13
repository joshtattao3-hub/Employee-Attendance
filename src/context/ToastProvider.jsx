import { useState, useCallback, useMemo } from "react";
import { ToastContext } from "./toastContext";
import Toast from "../components/Toast";

export function ToastProvider({ children }) {
  const [message, setMessage] = useState(null);

  const showToast = useCallback(
    (type, text) => setMessage({ type, text }),
    []
  );
  const clearMessage = useCallback(() => setMessage(null), []);

  // Only showToast is shared, so components that call it don't
  // re-render every time a toast appears or disappears.
  const value = useMemo(() => ({ showToast }), [showToast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <Toast message={message} onDismiss={clearMessage} />
    </ToastContext.Provider>
  );
}