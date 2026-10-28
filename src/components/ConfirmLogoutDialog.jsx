import Modal from "./Modal";

// Presentational only: AuthProvider owns the open/busy state.
function ConfirmLogoutDialog({ open, busy, onConfirm, onCancel }) {
  return (
    <Modal
      open={open}
      title="Confirm Logout"
      onClose={onCancel}
      dismissible={!busy}
    >
      <p className="logout-dialog__text">
        Are you sure you want to log out?
      </p>
      <div className="logout-dialog__actions">
        {/* Cancel gets focus first: the safe choice for a destructive action */}
        <button
          type="button"
          className="btn-secondary"
          onClick={onCancel}
          disabled={busy}
          data-autofocus
        >
          Cancel
        </button>
        <button
          type="button"
          className="btn-primary"
          onClick={onConfirm}
          disabled={busy}
        >
          {busy ? (
            <>
              <span className="spinner" aria-hidden="true" />
              Logging out…
            </>
          ) : (
            "Yes, Log Out"
          )}
        </button>
      </div>
    </Modal>
  );
}

export default ConfirmLogoutDialog;