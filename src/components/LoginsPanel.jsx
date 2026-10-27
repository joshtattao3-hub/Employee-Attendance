import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import Avatar from "./Avatar";
import StatusBadge from "./StatusBadge";
import Modal from "./Modal";
import { AlertCircleIcon } from "./Icons";
import { useToast } from "../hooks/useToast";

// Ask the server function to create a login or reset a password.
// Returns { ok: true, data } or { ok: false, error }.
async function callManageLogins(body) {
  const { data, error } = await supabase.functions.invoke("manage-logins", { body });
  if (error) {
    let message = "Something went wrong. Try again.";
    try {
      const detail = await error.context.json();
      if (detail?.error) message = detail.error;
    } catch {
      // Keep the generic message (for example, no network)
    }
    return { ok: false, error: message };
  }
  return { ok: true, data };
}

function loginStatus(profile) {
  if (!profile) return "No login";
  if (!profile.active) return "Login off";
  if (profile.must_change_password) return "Password change pending";
  return "Login active";
}

function roleLabel(role) {
  return role ? role.charAt(0).toUpperCase() + role.slice(1) : "—";
}

// Admin-only: lists the employees in the database and lets the admin give
// them a sign-in or reset a forgotten password.
function LoginsPanel() {
  const { showToast } = useToast();
  const [state, setState] = useState({ status: "loading", rows: [] });
  const [reloadKey, setReloadKey] = useState(0);
  // null | { type: "create" | "reset", row } | { type: "result", ... }
  const [dialog, setDialog] = useState(null);
  const [role, setRole] = useState("employee");
  const [busy, setBusy] = useState(false);
  const [dialogError, setDialogError] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const { data, error } = await supabase
        .from("employees")
        .select(
          "id, employee_code, full_name, email, active, " +
            "branch:branches(name), " +
            "profile:profiles(id, role, active, must_change_password)"
        )
        .order("employee_code");
      if (cancelled) return;

      if (error) {
        setState({ status: "error", rows: [] });
        return;
      }

      const rows = data.map((row) => ({
        ...row,
        branch: Array.isArray(row.branch) ? row.branch[0] : row.branch,
        profile: Array.isArray(row.profile) ? row.profile[0] : row.profile,
      }));
      setState({ status: "ready", rows });
    })();

    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  function openDialog(type, row) {
    setRole("employee");
    setDialogError("");
    setCopied(false);
    setDialog({ type, row });
  }

  function closeDialog() {
    setDialog(null);
    setDialogError("");
  }

  async function runAction() {
    if (!dialog || busy) return;
    const { type, row } = dialog;

    setBusy(true);
    setDialogError("");
    const result = await callManageLogins(
      type === "create"
        ? { action: "create_login", employee_id: row.id, role }
        : { action: "reset_password", employee_id: row.id }
    );
    setBusy(false);

    if (!result.ok) {
      setDialogError(result.error);
      return;
    }

    // The password is shown once, in this dialog. It is not stored anywhere.
    setCopied(false);
    setDialog({
      type: "result",
      kind: type,
      name: result.data.name,
      code: result.data.employee_code,
      email: result.data.email,
      password: result.data.temp_password,
    });
    setReloadKey((key) => key + 1);
  }

    async function runRoleChange() {
    if (!dialog || busy) return;
    const { row } = dialog;
    const nextRole = row.profile.role === "manager" ? "employee" : "manager";

    setBusy(true);
    setDialogError("");
    const { data, error } = await supabase
      .from("profiles")
      .update({ role: nextRole })
      .eq("id", row.profile.id)
      .in("role", ["employee", "manager"])
      .select("id");
    setBusy(false);

    if (error) {
      setDialogError(
        error.code === "42501"
          ? "You don’t have permission to do that."
          : "We couldn’t save that. Check your connection and try again."
      );
      return;
    }
    if (!data || data.length === 0) {
      setDialogError("That login couldn’t be changed. Reload the page and try again.");
      return;
    }

    showToast("success", `${row.full_name} is now a ${nextRole}.`);
    closeDialog();
    setReloadKey((key) => key + 1);
  }

  async function copyPassword(text) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setDialogError("Couldn’t copy automatically. Select the password and copy it by hand.");
    }
  }

  const title =
    dialog?.type === "create"
      ? "Create login"
      : dialog?.type === "reset"
        ? "Reset password"
        : dialog?.type === "role"
          ? "Change role"
          : dialog?.type === "result"
            ? dialog.kind === "create"
              ? "Login created"
              : "Password reset"
            : "";

  return (
    <>
      <section className="card panel" aria-labelledby="logins-title">
        <div className="panel__header">
          <div>
            <h2 id="logins-title" className="panel__title">Employee logins</h2>
            <p className="panel__subtitle">
              Give employees a sign-in or reset a forgotten password. Temporary
              passwords are shown once.
            </p>
          </div>
        </div>

        {state.status === "loading" && (
          <div className="empty-state" role="status">
            <span className="spinner spinner--dark" aria-hidden="true" />
            <p className="empty-state__text">Loading employees…</p>
          </div>
        )}

        {state.status === "error" && (
          <div className="empty-state">
            <h3 className="empty-state__title">Couldn’t load employees</h3>
            <p className="empty-state__text">Check your connection and try again.</p>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => {
                setState({ status: "loading", rows: [] });
                setReloadKey((key) => key + 1);
              }}
            >
              Try again
            </button>
          </div>
        )}

        {state.status === "ready" && (
          <div className="table-wrapper">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Employee</th>
                  <th>Branch</th>
                  <th>Login</th>
                  <th>Role</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {state.rows.map((row) => (
                  <tr key={row.id} className={row.active ? "" : "row--inactive"}>
                    <td>
                      <div className="employee-cell">
                        <Avatar name={row.full_name} />
                        <div className="employee-cell__text">
                          <span className="employee-cell__name">{row.full_name}</span>
                          <span className="employee-cell__sub">
                            {row.employee_code} · {row.email}
                          </span>
                        </div>
                      </div>
                    </td>
                    <td>{row.branch?.name ?? "—"}</td>
                    <td>
                      <StatusBadge status={loginStatus(row.profile)} />
                    </td>
                    <td>{roleLabel(row.profile?.role)}</td>
                                        <td>
                      <div className="row-actions">
                        {!row.active ? (
                          <span className="cell-muted">Deactivated</span>
                        ) : row.profile ? (
                          <>
                            <button
                              type="button"
                              className="btn-secondary btn-sm"
                              onClick={() => openDialog("reset", row)}
                              disabled={busy}
                              aria-label={`Reset password for ${row.full_name}`}
                            >
                              Reset password
                            </button>
                            {row.profile.active && row.profile.role !== "admin" && (
                              <button
                                type="button"
                                className="btn-secondary btn-sm"
                                onClick={() => openDialog("role", row)}
                                disabled={busy}
                                aria-label={`Change role for ${row.full_name}`}
                              >
                                {row.profile.role === "manager" ? "Make employee" : "Make manager"}
                              </button>
                            )}
                          </>
                        ) : (
                          <button
                            type="button"
                            className="btn-primary btn-sm"
                            onClick={() => openDialog("create", row)}
                            disabled={busy}
                            aria-label={`Create login for ${row.full_name}`}
                          >
                            Create login
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <Modal open={dialog !== null} title={title} onClose={closeDialog}>
        {dialog?.type === "create" && (
          <>
            <div className="modal__body">
              <p className="modal__text">
                Create a sign-in for <strong>{dialog.row.full_name}</strong> (
                {dialog.row.email}). You’ll get a temporary password to share with
                them. They’ll choose their own the first time they sign in.
              </p>
              <label className="field">
                <span className="field__label">Role</span>
                <select
                  className="field__control"
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                  disabled={busy}
                >
                  <option value="employee">Employee</option>
                  <option value="manager">Manager</option>
                </select>
              </label>
              {dialogError && (
                <div className="alert alert--error modal__alert" role="alert">
                  <AlertCircleIcon size={18} />
                  <span>{dialogError}</span>
                </div>
              )}
            </div>
            <div className="modal__footer">
              <button type="button" className="btn-secondary" onClick={closeDialog}>
                Cancel
              </button>
              <button
                type="button"
                className="btn-primary"
                onClick={runAction}
                disabled={busy}
                data-autofocus
              >
                {busy ? "Creating…" : "Create login"}
              </button>
            </div>
          </>
        )}

        {dialog?.type === "reset" && (
          <>
            <div className="modal__body">
              <p className="modal__text">
                Reset the password for <strong>{dialog.row.full_name}</strong>? Their
                old password stops working, and you’ll get a new temporary one to
                share with them.
              </p>
              {dialogError && (
                <div className="alert alert--error modal__alert" role="alert">
                  <AlertCircleIcon size={18} />
                  <span>{dialogError}</span>
                </div>
              )}
            </div>
            <div className="modal__footer">
              <button type="button" className="btn-secondary" onClick={closeDialog}>
                Cancel
              </button>
              <button
                type="button"
                className="btn-danger"
                onClick={runAction}
                disabled={busy}
                data-autofocus
              >
                {busy ? "Resetting…" : "Reset password"}
              </button>
            </div>
          </>
        )}

        {dialog?.type === "role" && (
          <>
            <div className="modal__body">
              <p className="modal__text">
                {dialog.row.profile.role === "manager" ? (
                  <>
                    Make <strong>{dialog.row.full_name}</strong> a regular employee?
                    They’ll lose the team screens.
                  </>
                ) : (
                  <>
                    Make <strong>{dialog.row.full_name}</strong> a manager? They’ll be
                    able to view attendance and employees for{" "}
                    {dialog.row.branch?.name ?? "their branch"} (read-only).
                  </>
                )}
              </p>
              <p className="modal__text">
                The change applies straight away. Their menu updates the next time
                they sign in or reload the page.
              </p>
              {dialogError && (
                <div className="alert alert--error modal__alert" role="alert">
                  <AlertCircleIcon size={18} />
                  <span>{dialogError}</span>
                </div>
              )}
            </div>
            <div className="modal__footer">
              <button type="button" className="btn-secondary" onClick={closeDialog}>
                Cancel
              </button>
              <button
                type="button"
                className="btn-primary"
                onClick={runRoleChange}
                disabled={busy}
                data-autofocus
              >
                {busy
                  ? "Saving…"
                  : dialog.row.profile.role === "manager"
                    ? "Make employee"
                    : "Make manager"}
              </button>
            </div>
          </>
        )}

        {dialog?.type === "result" && (
          <>
            <div className="modal__body">
              <p className="modal__text">
                <strong>{dialog.name}</strong> ({dialog.code}) can sign in with:
              </p>
              <dl className="secret-list">
                <div>
                  <dt>Email</dt>
                  <dd>
                    <code>{dialog.email}</code>
                  </dd>
                </div>
                <div>
                  <dt>Temporary password</dt>
                  <dd className="secret-box">
                    <code>{dialog.password}</code>
                    <button
                      type="button"
                      className="btn-secondary btn-sm"
                      onClick={() => copyPassword(dialog.password)}
                    >
                      {copied ? "Copied" : "Copy"}
                    </button>
                  </dd>
                </div>
              </dl>
              <div className="alert alert--warning modal__alert" role="note">
                <AlertCircleIcon size={18} />
                <span>
                  Copy this now. It won’t be shown again. Share it privately, and
                  they’ll be asked to choose a new password at first sign-in.
                </span>
              </div>
              {dialogError && (
                <div className="alert alert--error modal__alert" role="alert">
                  <AlertCircleIcon size={18} />
                  <span>{dialogError}</span>
                </div>
              )}
            </div>
            <div className="modal__footer">
              <button
                type="button"
                className="btn-primary"
                onClick={closeDialog}
                data-autofocus
              >
                Done
              </button>
            </div>
          </>
        )}
      </Modal>
    </>
  );
}

export default LoginsPanel;