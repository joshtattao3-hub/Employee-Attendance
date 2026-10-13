import { getStatus, getActionState } from "../utils/attendance";
import Avatar from "./Avatar";
import StatusBadge from "./StatusBadge";
import SearchBar from "./SearchBar";
import { LogInIcon, LogOutIcon, SearchIcon } from "./Icons";

// One Time In / Time Out button. The tooltip lives on the wrapper because
// browsers don't reliably show tooltips on disabled buttons.
function ActionButton({ kind, name, enabled, reason, onClick }) {
  const isIn = kind === "in";
  const label = isIn ? "Time In" : "Time Out";
  const ActionIcon = isIn ? LogInIcon : LogOutIcon;

  return (
    <span
      className={`action-wrap ${enabled ? "" : "action-wrap--disabled"}`}
      title={enabled ? undefined : reason}
    >
      <button
        type="button"
        className={`action-btn action-btn--${kind}`}
        onClick={onClick}
        disabled={!enabled}
        aria-label={
          enabled ? `${label} ${name}` : `${label} ${name}: ${reason}`
        }
      >
        <ActionIcon size={16} />
        {label}
      </button>
    </span>
  );
}

function EmployeeList({
  employees,
  records,
  totalCount,
  searchTerm,
  onSearchChange,
  onTimeIn,
  onTimeOut,
}) {
  const isSearching = searchTerm.trim() !== "";
  const subtitle = isSearching
    ? `${employees.length} of ${totalCount} employees`
    : `${totalCount} employees`;

  return (
    <section className="card panel">
      <div className="panel__header">
        <div>
          <h2 className="panel__title">Employee attendance</h2>
          <p className="panel__subtitle">{subtitle}</p>
        </div>
        <SearchBar value={searchTerm} onChange={onSearchChange} />
      </div>

      {employees.length === 0 ? (
        <div className="empty-state">
          <span className="empty-state__icon">
            <SearchIcon size={22} />
          </span>
          <h3 className="empty-state__title">No employees found</h3>
          <p className="empty-state__text">
            No one matches “{searchTerm.trim()}”. Try a different name or
            employee ID.
          </p>
          <button
            type="button"
            className="btn-secondary"
            onClick={() => onSearchChange("")}
          >
            Clear search
          </button>
        </div>
      ) : (
        <div className="table-wrapper">
          <table className="data-table">
            <thead>
              <tr>
                <th>Employee</th>
                <th>ID</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {employees.map((emp) => {
                const status = getStatus(records, emp.id);
                const actions = getActionState(records, emp.id);

                return (
                  <tr key={emp.id}>
                    <td>
                      <div className="employee-cell">
                        <Avatar name={emp.name} />
                        <span className="employee-cell__name">{emp.name}</span>
                      </div>
                    </td>
                    <td className="cell-id">{emp.id}</td>
                    <td>
                      <StatusBadge status={status} />
                    </td>
                    <td>
                      <div className="row-actions">
                        <ActionButton
                          kind="in"
                          name={emp.name}
                          enabled={actions.canTimeIn}
                          reason={actions.timeInReason}
                          onClick={() => onTimeIn(emp.id)}
                        />
                        <ActionButton
                          kind="out"
                          name={emp.name}
                          enabled={actions.canTimeOut}
                          reason={actions.timeOutReason}
                          onClick={() => onTimeOut(emp.id)}
                        />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

export default EmployeeList;