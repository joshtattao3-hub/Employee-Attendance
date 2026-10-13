import { useData } from "../hooks/useData";
import { useToast } from "../hooks/useToast";

function SettingsPage() {
  // The browser's own time zone, e.g. "Asia/Manila"
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;

   const { resetDemoData } = useData();
   const { showToast } = useToast();

   function handleReset() {
     const ok = window.confirm(
       "Reset all demo data? Employees and attendance records return to their starting state."
     );
     if (!ok) return;
     resetDemoData();
     showToast("success", "Demo data has been reset.");
   }

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
        "Demo data is saved in this browser only (localStorage) and never leaves your device.",
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
            <div className="settings-footer">
        <button type="button" className="btn-secondary" onClick={handleReset}>
          Reset demo data
        </button>
      </div>
    </section>
  );
}

export default SettingsPage;