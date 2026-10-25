// Maps each stored status to its display label and color tone
const STATUS_CONFIG = {
  "Not Timed In": { label: "Not clocked in", tone: "neutral" },
  "Timed In": { label: "Clocked in", tone: "success" },
  "Timed Out": { label: "Clocked out", tone: "info" },
  "In progress": { label: "In progress", tone: "success" },
  Completed: { label: "Completed", tone: "info" },
  "Missed time-out": { label: "Missed time-out", tone: "warning" },
  Active: { label: "Active", tone: "success" },
  Inactive: { label: "Inactive", tone: "neutral" },
  "No login": { label: "No login", tone: "neutral" },
  "Login active": { label: "Login active", tone: "success" },
  "Password change pending": { label: "Password change pending", tone: "warning" },
  "Login off": { label: "Login off", tone: "neutral" },
};

function StatusBadge({ status }) {
  const config = STATUS_CONFIG[status] ?? { label: status, tone: "neutral" };

  return (
    <span className={`status-badge status-badge--${config.tone}`}>
      <span className="status-badge__dot" aria-hidden="true" />
      {config.label}
    </span>
  );
}

export default StatusBadge;