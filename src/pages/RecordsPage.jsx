import { useState } from "react";
import { employees } from "../data/employees";
import { getRecordStatus, getDateKey } from "../utils/attendance";
import SearchBar from "../components/SearchBar";
import RecordsTable from "../components/RecordsTable";
import { RecordsIcon, SearchIcon } from "../components/Icons";

function RecordsPage({ records }) {
  const [searchTerm, setSearchTerm] = useState("");
  const [status, setStatus] = useState("all");
  const [date, setDate] = useState("");

  const query = searchTerm.trim().toLowerCase();

  // A record is shown only if it passes all three filters
  const filtered = records.filter((record) => {
    const employee = employees.find((e) => e.id === record.employeeId);

    const matchesSearch =
      employee.name.toLowerCase().includes(query) ||
      record.employeeId.toLowerCase().includes(query);
    const matchesStatus = status === "all" || getRecordStatus(record) === status;
    const matchesDate = !date || getDateKey(record.timeIn) === date;

    return matchesSearch && matchesStatus && matchesDate;
  });

  const hasFilters = query !== "" || status !== "all" || date !== "";

  function clearFilters() {
    setSearchTerm("");
    setStatus("all");
    setDate("");
  }

  const subtitle = hasFilters
    ? `${filtered.length} of ${records.length} records`
    : `${records.length} records`;

  return (
    <section className="card panel">
      <div className="panel__header">
        <div>
          <p className="panel__subtitle">{subtitle}</p>
        </div>
      </div>

      <div className="toolbar">
        <SearchBar value={searchTerm} onChange={setSearchTerm} />

        <label className="field">
          <span className="field__label">Status</span>
          <select
            className="field__control"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            <option value="all">All statuses</option>
            <option value="In progress">In progress</option>
            <option value="Completed">Completed</option>
          </select>
        </label>

        <label className="field">
          <span className="field__label">Date</span>
          <input
            type="date"
            className="field__control"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </label>

        {hasFilters && (
          <button type="button" className="btn-secondary" onClick={clearFilters}>
            Clear filters
          </button>
        )}
      </div>

      {records.length === 0 ? (
        <div className="empty-state">
          <span className="empty-state__icon">
            <RecordsIcon size={22} />
          </span>
          <h3 className="empty-state__title">No attendance records yet</h3>
          <p className="empty-state__text">
            Records appear here as soon as an employee clocks in.
          </p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="empty-state">
          <span className="empty-state__icon">
            <SearchIcon size={22} />
          </span>
          <h3 className="empty-state__title">No matching records</h3>
          <p className="empty-state__text">
            Nothing matches your current filters. Try adjusting or clearing
            them.
          </p>
          <button type="button" className="btn-secondary" onClick={clearFilters}>
            Clear filters
          </button>
        </div>
      ) : (
        <RecordsTable records={filtered} employees={employees} />
      )}
    </section>
  );
}

export default RecordsPage;