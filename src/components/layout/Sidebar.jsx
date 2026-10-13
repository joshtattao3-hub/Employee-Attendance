import { NAV_ITEMS } from "../../data/navigation";
import { ClockIcon, CloseIcon } from "../Icons";

function Sidebar({ activePage, onNavigate, isOpen, onClose }) {
  return (
    <aside className={`sidebar ${isOpen ? "sidebar--open" : ""}`}>
      <div className="sidebar__brand">
        <span className="brand-mark">
          <ClockIcon size={18} />
        </span>
        <span className="brand-name">Hirara</span>
        <button
          className="icon-btn sidebar__close"
          onClick={onClose}
          aria-label="Close menu"
        >
          <CloseIcon />
        </button>
      </div>

      <nav aria-label="Main navigation">
        <ul className="nav-list">
          {NAV_ITEMS.map(({ id, label, icon: NavIcon }) => (
            <li key={id}>
              <button
                className={`nav-item ${activePage === id ? "nav-item--active" : ""}`}
                onClick={() => onNavigate(id)}
                aria-current={activePage === id ? "page" : undefined}
                title={label}
              >
                <NavIcon />
                <span className="nav-item__label">{label}</span>
              </button>
            </li>
          ))}
        </ul>
      </nav>
    </aside>
  );
}

export default Sidebar;