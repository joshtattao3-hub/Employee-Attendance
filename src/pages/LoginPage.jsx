import { useState } from "react";
import { useAuth } from "../hooks/useAuth";
import { validateEmail, validateRequired } from "../utils/validation";
import FormField from "../components/FormField";
import { AlertCircleIcon } from "../components/Icons";

function LoginPage() {
  const { login, authNotice } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setFormError("");

    const nextErrors = {
      email: validateEmail(email),
      password: validateRequired(password, "Enter your password."),
    };
    setErrors(nextErrors);
    if (nextErrors.email) {
      document.getElementById("login-email")?.focus();
      return;
    }
    if (nextErrors.password) {
      document.getElementById("login-password")?.focus();
      return;
    }

    setLoading(true);
    const result = await login(email, password);

    // On success this page is replaced by the app, so only handle failure
    if (!result.ok) {
      setFormError(result.error);
      setLoading(false);
    }
  }

  return (
    <>
      <h1 className="auth__title">Sign in</h1>
      <p className="auth__subtitle">Welcome back. Enter your details to continue.</p>

      {authNotice && !formError && (
        <div className="alert alert--info" role="status">
          <AlertCircleIcon size={18} />
          <span>{authNotice}</span>
        </div>
      )}

      {formError && (
        <div className="alert alert--error" role="alert">
          <AlertCircleIcon size={18} />
          <span>{formError}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} noValidate className="auth__form">
        <FormField
          id="login-email"
          label="Email"
          type="email"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            setErrors((prev) => ({ ...prev, email: "" }));
          }}
          error={errors.email}
          autoComplete="email"
          placeholder="you@company.com"
          disabled={loading}
        />
        <FormField
          id="login-password"
          label="Password"
          type="password"
          value={password}
          onChange={(e) => {
            setPassword(e.target.value);
            setErrors((prev) => ({ ...prev, password: "" }));
          }}
          error={errors.password}
          autoComplete="current-password"
          placeholder="Enter your password"
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
              Signing in…
            </>
          ) : (
            "Sign in"
          )}
        </button>
      </form>

      <p className="auth__note">
        Forgot your password? Ask your administrator to reset it for you.
      </p>
    </>
  );
}

export default LoginPage;