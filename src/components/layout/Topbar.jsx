import { MenuIcon, CalendarIcon } from "../Icons";

function Topbar({ title, onMenuClick }) {
  const now = new Date();
  const longDate = now.toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  const shortDate = now.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });

  return (
    <header className="topbar">
      <div className="topbar__left">
        <button
          className="icon-btn topbar__menu"
          onClick={onMenuClick}
          aria-label="Open menu"
        >
          <MenuIcon />
        </button>
        <h1 className="topbar__title">{title}</h1>
      </div>
    </header>
  );
}

export default Topbar;