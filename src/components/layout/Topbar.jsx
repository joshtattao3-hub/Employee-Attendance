import { MenuIcon } from "../Icons";

function Topbar({ title, onMenuClick }) {
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