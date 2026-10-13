import { useState } from "react";
import { useAuth } from "../hooks/useAuth";
import {
  validateName,
  validateEmail,
  validatePassword,
  validateConfirm,
} from "../utils/validation";
import FormField from "../components/FormField";
import PasswordStrength from "../components/PasswordStrength";
import { AlertCircleIcon } from "../components/Icons";

const FIELD_ORDER = ["name", "email", "password", "confirm"];

function SignupPage({ onSwitch }) {
  const { signup } = useAuth();

  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    confirm: "",
  });
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState("");
  const [loading, setLoading] = useState(false);

  // Returns an onChange handler for one field and clears that field's error
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

  function focusField(field) {
    document.getElementById(`signup-${field}`)?.focus();
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setFormError("");

    const nextErrors = {
      name: validateName(form.name),
      email: validateEmail(form.email),
      password: validatePassword(form.password),
      confirm: validateConfirm(form.password, form.confirm),
    };
    setErrors(nextErrors);

    const firstInvalid = FIELD_ORDER.find((field) => nextErrors[field]);
    if (firstInvalid) {
      focusField(firstInvalid);
      return;
    }

    setLoading(true);
    const result = await signup({
      name: form.name,
      email: form.email,
      password: form.password,
    });

    // On success this page is replaced by the app, so only handle failure
    if (!result.ok) {
      setLoading(false);
      if (result.field) {
        setErrors((prev) => ({ ...prev, [result.field]: result.error }));
        // Wait a tick so the inputs are re-enabled before focusing
        setTimeout(() => focusField(result.field), 0);
      } else {
        setFormError(result.error);
      }
    }
  }

  return (
    <>
      <h1 className="auth__title">Create your account</h1>
      <p className="auth__subtitle">Join your team’s attendance workspace.</p>

      {formError && (
        <div className="alert alert--error" role="alert">
          <AlertCircleIcon size={18} />
          <span>{formError}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} noValidate className="auth__form">
        <FormField
          id="signup-name"
          label="Full name"
          value={form.name}
          onChange={update("name")}
          error={errors.name}
          autoComplete="name"
          placeholder="Juan Dela Cruz"
          maxLength={60}
          disabled={loading}
        />
        <FormField
          id="signup-email"
          label="Work email"
          type="email"
          value={form.email}
          onChange={update("email")}
          error={errors.email}
          hint="If HR already added you, use the email they have on file to link your record."
          autoComplete="email"
          placeholder="you@company.com"
          maxLength={254}
          disabled={loading}
        />
        <FormField
          id="signup-password"
          label="Password"
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
          id="signup-confirm"
          label="Confirm password"
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
              Creating account…
            </>
          ) : (
            "Create account"
          )}
        </button>
      </form>

      <p className="auth__switch">
        Already have an account?{" "}
        <button type="button" className="link-btn" onClick={onSwitch} disabled={loading}>
          Sign in
        </button>
      </p>

      <p className="auth__note">
        Demo mode: your account is stored only in this browser and isn’t
        secure. Don’t use a real password.
      </p>
    </>
  );
}

export default SignupPage;