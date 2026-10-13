import { getNavItems } from "../../data/navigation";
import { ClockIcon, CloseIcon, LogOutIcon } from "../Icons";
import { useAuth } from "../../hooks/useAuth";
import Avatar from "../Avatar";

function Sidebar({ activePage, onNavigate, isOpen, onClose }) {
    const { currentUser, logout } = useAuth();
    const navItems = getNavItems(currentUser.role);
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
          {navItems.map(({ id, label, icon: NavIcon }) => (
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
               <div className="sidebar__user">
           <Avatar name={currentUser.name} />
           <div className="sidebar__user-info">
             <p className="sidebar__user-name">{currentUser.name}</p>
             <p className="sidebar__user-role">
               {currentUser.role === "admin" ? "Administrator" : "Employee"}
             </p>
           </div>
           <button
             type="button"
             className="icon-btn sidebar__logout"
             onClick={logout}
             aria-label="Sign out"
             title="Sign out"
           >
             <LogOutIcon size={18} />
           </button>
         </div>
    </aside>
  );
}

export default Sidebar;