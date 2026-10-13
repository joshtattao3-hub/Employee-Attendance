function SettingsPage() {
  // The browser's own time zone, e.g. "Asia/Manila"
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;

  const rows = [
    { label: "Company", value: "Hirara" },
    { label: "Time zone", value: timeZone },
    {
      label: "Attendance rule",
      value: "One shift per employee per day. Duplicate clock-ins are blocked.",
    },
    {
      label: "Data storage",
      value:
        "Demo data is kept in memory only and resets when the page is refreshed.",
    },
  ];

  return (
    <section className="card panel">
      <div className="panel__header">
        <div>
          <h2 className="panel__title">Workspace</h2>
          <p className="panel__subtitle">Read-only overview for this demo</p>
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
  );
}

export default SettingsPage;