import { useState } from "react";
import { useAuth } from "../hooks/useAuth";
import { DEMO_CREDENTIALS } from "../data/accounts";
import { validateEmail, validateRequired } from "../utils/validation";
import FormField from "../components/FormField";
import { AlertCircleIcon } from "../components/Icons";

function LoginPage({ onSwitch }) {
  const { login } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState("");
  const [loading, setLoading] = useState(false);

  function fillDemo(demo) {
    setEmail(demo.email);
    setPassword(demo.password);
    setErrors({});
    setFormError("");
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setFormError("");

    const nextErrors = {
      email: validateEmail(email),
      password: validateRequired(password, "Enter your password."),
    };
    setErrors(nextErrors);
    if (nextErrors.email || nextErrors.password) return;

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

      <p className="auth__switch">
        New to Hirara?{" "}
        <button type="button" className="link-btn" onClick={onSwitch} disabled={loading}>
          Create an account
        </button>
      </p>

      <div className="demo-box">
        <p className="demo-box__title">Demo accounts</p>
        <p className="demo-box__note">
          Demo mode: sign-in runs entirely in your browser and is not secure.
          Don’t enter a real password anywhere in this app.
        </p>
        <ul className="demo-box__list">
          {DEMO_CREDENTIALS.map((demo) => (
            <li key={demo.email} className="demo-box__row">
              <div>
                <p className="demo-box__role">{demo.role}</p>
                <p className="demo-box__cred">
                  <code>{demo.email}</code>
                </p>
                <p className="demo-box__cred">
                  <code>{demo.password}</code>
                </p>
              </div>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => fillDemo(demo)}
                disabled={loading}
              >
                Use
              </button>
            </li>
          ))}
        </ul>
      </div>
    </>
  );
}

export default LoginPage;