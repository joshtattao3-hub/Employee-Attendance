import { LogInIcon, LogOutIcon } from "./Icons";

// One Time In / Time Out button. The tooltip lives on the wrapper because
// browsers don't reliably show tooltips on disabled buttons.
function ActionButton({ kind, name, enabled, reason, onClick, size = "md" }) {
  const isIn = kind === "in";
  const label = isIn ? "Time In" : "Time Out";
  const ActionIcon = isIn ? LogInIcon : LogOutIcon;
  const base = name ? `${label} ${name}` : label;

  return (
    <span
      className={`action-wrap ${enabled ? "" : "action-wrap--disabled"}`}
      title={enabled ? undefined : reason}
    >
      <button
        type="button"
        className={`action-btn action-btn--${kind} ${size === "lg" ? "action-btn--lg" : ""}`}
        onClick={onClick}
        disabled={!enabled}
        aria-label={enabled ? base : `${base}: ${reason}`}
      >
        <ActionIcon size={size === "lg" ? 18 : 16} />
        {label}
      </button>
    </span>
  );
}

export default ActionButton;