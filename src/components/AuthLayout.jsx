import { ClockIcon, CheckCircleIcon } from "./Icons";

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
          <h2 className="auth__headline">Every shift, accounted for.</h2>
          <p className="auth__lead">
            Clock in, clock out, and see your whole team’s day at a glance.
          </p>
          <ul className="auth__points">
            <li><CheckCircleIcon size={18} /> One-tap clock in and clock out</li>
            <li><CheckCircleIcon size={18} /> Live attendance summaries for HR</li>
            <li><CheckCircleIcon size={18} /> Export records to CSV</li>
          </ul>
        </div>
      </aside>

      <main className="auth__main">
        <div className="auth__card">{children}</div>
      </main>
    </div>
  );
}

export default AuthLayout;