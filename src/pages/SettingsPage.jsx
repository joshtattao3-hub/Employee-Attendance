import LoginsPanel from "../components/LoginsPanel";

function SettingsPage() {
  // The browser's own time zone, e.g. "Asia/Manila"
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;

  const rows = [
    { label: "Company", value: "Hirara" },
    { label: "Your time zone", value: timeZone },
    {
      label: "Attendance rule",
      value:
        "One shift per employee per work day. Duplicate clock-ins are blocked, and a shift left open too long becomes a missed time-out.",
    },
    {
      label: "Attendance data",
      value:
        "Stored in the live database. Every time is stamped by the server clock, and each work day follows the branch’s time zone.",
    },
  ];

  return (
    <>
      <LoginsPanel />

      <section className="card panel">
        <div className="panel__header">
          <div>
            <h2 className="panel__title">Workspace</h2>
            <p className="panel__subtitle">Read-only overview</p>
          </div>
        </div>

        <dl className="settings-list">
          {rows.map(({ label, value }) => (
            <div key={label} className="settings-row">
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
      </section>
    </>
  );
}

export default SettingsPage;