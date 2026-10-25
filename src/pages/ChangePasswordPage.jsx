import { useState } from "react";
import { useAuth } from "../hooks/useAuth";
import { useToast } from "../hooks/useToast";
import { validatePassword, validateConfirm } from "../utils/validation";
import AuthLayout from "../components/AuthLayout";
import FormField from "../components/FormField";
import PasswordStrength from "../components/PasswordStrength";
import { AlertCircleIcon } from "../components/Icons";

// Shown after an administrator creates your login or resets your password.
function ChangePasswordPage() {
  const { currentUser, changePassword, logout } = useAuth();
  const { showToast } = useToast();

  const [form, setForm] = useState({ password: "", confirm: "" });
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState("");
  const [loading, setLoading] = useState(false);

  function update(field) {
    return (e) => {
      const value = e.target.value;
      setForm((prev) => ({ ...prev, [field]: value }));
      setErrors((prev) => ({
        ...prev,
        [field]: "",
        ...(field === "password" ? { confirm: "" } : {}),
      }));
    };
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setFormError("");

    const nextErrors = {
      password: validatePassword(form.password),
      confirm: validateConfirm(form.password, form.confirm),
    };
    setErrors(nextErrors);
    if (nextErrors.password) {
      document.getElementById("new-password")?.focus();
      return;
    }
    if (nextErrors.confirm) {
      document.getElementById("confirm-password")?.focus();
      return;
    }

    setLoading(true);
    const result = await changePassword(form.password);

    // On success this page is replaced by the app, so only handle failure
    if (result.ok) {
      showToast("success", "Password updated. You’re all set.");
      return;
    }
    setFormError(result.error);
    setLoading(false);
  }

  return (
    <AuthLayout>
      <h1 className="auth__title">Choose a new password</h1>
      <p className="auth__subtitle">
        Signed in as <strong>{currentUser.email}</strong>. Your administrator gave
        you a temporary password. Choose your own to continue.
      </p>

      {formError && (
        <div className="alert alert--error" role="alert">
          <AlertCircleIcon size={18} />
          <span>{formError}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} noValidate className="auth__form">
        <FormField
          id="new-password"
          label="New password"
          type="password"
          value={form.password}
          onChange={update("password")}
          error={errors.password}
          autoComplete="new-password"
          placeholder="Create a password"
          maxLength={128}
          disabled={loading}
        />
        <PasswordStrength password={form.password} />
        <FormField
          id="confirm-password"
          label="Confirm new password"
          type="password"
          value={form.confirm}
          onChange={update("confirm")}
          error={errors.confirm}
          autoComplete="new-password"
          placeholder="Re-enter your password"
          maxLength={128}
          disabled={loading}
        />

        <button
          type="submit"
          className="btn-primary btn-primary--block"
          disabled={loading}
        >
          {loading ? (
            <>
              <span className="spinner" aria-hidden="true" />
              Saving…
            </>
          ) : (
            "Save password and continue"
          )}
        </button>
      </form>

      <p className="auth__switch">
        Not you?{" "}
        <button type="button" className="link-btn" onClick={logout} disabled={loading}>
          Sign out
        </button>
      </p>
    </AuthLayout>
  );
}

export default ChangePasswordPage;