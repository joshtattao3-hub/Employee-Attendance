import { useState } from "react";
import { employees } from "../data/employees";
import {
  getStatus,
  getLatestRecord,
  formatDate,
  formatTime,
} from "../utils/attendance";
import Avatar from "../components/Avatar";
import StatusBadge from "../components/StatusBadge";
import SearchBar from "../components/SearchBar";
import { SearchIcon } from "../components/Icons";

// A short sentence describing the employee's most recent action
function describeLastActivity(records, employeeId) {
  const latest = getLatestRecord(records, employeeId);
  if (!latest) return "No activity yet";

  const iso = latest.timeOut ?? latest.timeIn;
  const action = latest.timeOut ? "Clocked out" : "Clocked in";
  return `${action} · ${formatDate(iso)}, ${formatTime(iso)}`;
}

function EmployeesPage({ records }) {
  const [searchTerm, setSearchTerm] = useState("");

  const query = searchTerm.trim().toLowerCase();
  const filtered = employees.filter(
    (emp) =>
      emp.name.toLowerCase().includes(query) ||
      emp.id.toLowerCase().includes(query)
  );

  const subtitle =
    query !== ""
      ? `${filtered.length} of ${employees.length} employees`
      : `${employees.length} employees`;

  return (
    <section className="card panel">
      <div className="panel__header">
        <div>
          <p className="panel__subtitle">{subtitle}</p>
        </div>
        <SearchBar value={searchTerm} onChange={setSearchTerm} />
      </div>

      {filtered.length === 0 ? (
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
            onClick={() => setSearchTerm("")}
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
                <th>Last activity</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((emp) => (
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
                  <td className="cell-muted">
                    {describeLastActivity(records, emp.id)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

export default EmployeesPage;