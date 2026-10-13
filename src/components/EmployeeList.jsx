import {
  getStatus,
  getTodayRecord,
  formatTime,
  calculateHours,
} from "../utils/attendance";
import Avatar from "./Avatar";
import StatusBadge from "./StatusBadge";
import SearchBar from "./SearchBar";
import { SearchIcon } from "./Icons";

function EmployeeList({
  employees,
  records,
  totalCount,
  searchTerm,
  onSearchChange,
}) {
  const isSearching = searchTerm.trim() !== "";
  const subtitle = isSearching
    ? `${employees.length} of ${totalCount} employees`
    : `${totalCount} employees`;

  return (
    <section className="card panel">
      <div className="panel__header">
        <div>
          <h2 className="panel__title">Today’s attendance</h2>
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
          <table className="data-table data-table--directory">
            <thead>
              <tr>
                <th>Employee</th>
                <th>ID</th>
                <th>Status</th>
                <th>Time In</th>
                <th>Time Out</th>
                <th>Hours</th>
              </tr>
            </thead>
            <tbody>
              {employees.map((emp) => {
                const today = getTodayRecord(records, emp.id);
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
                      <StatusBadge status={getStatus(records, emp.id)} />
                    </td>
                    <td className="cell-num">{formatTime(today?.timeIn)}</td>
                    <td className="cell-num">{formatTime(today?.timeOut)}</td>
                    <td className="cell-num">
                      {calculateHours(today?.timeIn, today?.timeOut)}
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