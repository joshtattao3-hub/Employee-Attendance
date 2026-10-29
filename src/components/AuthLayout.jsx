import { ClockIcon } from "./Icons";

function AuthLayout({ children }) {
  return (
    <div className="auth">
      <aside className="auth__brand">
        <div className="auth__brand-top">
          <span className="brand-mark">
            <ClockIcon size={18} />
          </span>
          <span className="brand-name">Hirara</span>
        </div>

        <div className="auth__hero">
          <h2 className="auth__headline">
            Presence <span className="auth__accent">powers</span> performance.
          </h2>
        </div>
      </aside>

      <main className="auth__main">
        <div className="auth__card">{children}</div>
      </main>
    </div>
  );
}

export default AuthLayout;