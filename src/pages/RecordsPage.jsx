import { useState } from "react";
import { useData } from "../hooks/useData";
import { useToast } from "../hooks/useToast";
import { getRecordStatus, getDateKey } from "../utils/attendance";
import { recordsToCsv, downloadCsv } from "../utils/csv";
import SearchBar from "../components/SearchBar";
import RecordsTable from "../components/RecordsTable";
import { RecordsIcon, SearchIcon, DownloadIcon, AlertCircleIcon } from "../components/Icons";

const RANGES = [
  { days: 7, label: "Last 7 days" },
  { days: 31, label: "Last 31 days" },
  { days: 90, label: "Last 90 days" },
];

function RecordsPage({ records }) {
  const { employees, rangeDays, setRangeDays, truncated } = useData();
  const { showToast } = useToast();

  const [searchTerm, setSearchTerm] = useState("");
  const [employeeId, setEmployeeId] = useState("all");
  const [status, setStatus] = useState("all");
  const [date, setDate] = useState("");

  const query = searchTerm.trim().toLowerCase();

  // A record is shown only if it passes all four filters
  const filtered = records.filter((record) => {
    const employee = employees.find((e) => e.id === record.employeeId);
    const name = employee?.name ?? "";

    const matchesSearch =
      name.toLowerCase().includes(query) ||
      record.employeeId.toLowerCase().includes(query);
    const matchesEmployee = employeeId === "all" || record.employeeId === employeeId;
    const matchesStatus = status === "all" || getRecordStatus(record) === status;
    const matchesDate = !date || record.workDate === date;

    return matchesSearch && matchesEmployee && matchesStatus && matchesDate;
  });

  const hasFilters =
    query !== "" || employeeId !== "all" || status !== "all" || date !== "";

  // Everyone, including deactivated employees, because their history is kept
  const employeeOptions = [...employees].sort((a, b) => a.name.localeCompare(b.name));

  function clearFilters() {
    setSearchTerm("");
    setEmployeeId("all");
    setStatus("all");
    setDate("");
  }

  function handleExport() {
    // Newest first, the same order as the table
    const csv = recordsToCsv([...filtered].reverse(), employees);
    const stamp = getDateKey(new Date().toISOString());
    downloadCsv(`attendance-records-${stamp}.csv`, csv);
    showToast(
      "success",
      `Exported ${filtered.length} ${filtered.length === 1 ? "record" : "records"} to CSV.`
    );
  }

  const subtitle = hasFilters
    ? `${filtered.length} of ${records.length} records`
    : `${records.length} records`;

  return (
    <section className="card panel">
      <div className="panel__header">
        <div>
          <h2 className="panel__title">Attendance records</h2>
          <p className="panel__subtitle">{subtitle}</p>
        </div>
        <button
          type="button"
          className="btn-secondary btn-with-icon"
          onClick={handleExport}
          disabled={filtered.length === 0}
        >
          <DownloadIcon size={16} />
          Export CSV
        </button>
      </div>

      <div className="toolbar">
        <SearchBar value={searchTerm} onChange={setSearchTerm} />

        <label className="field">
          <span className="field__label">Period</span>
          <select
            className="field__control"
            value={rangeDays}
            onChange={(e) => setRangeDays(Number(e.target.value))}
          >
            {RANGES.map((range) => (
              <option key={range.days} value={range.days}>
                {range.label}
              </option>
            ))}
          </select>
        </label>

        <label className="field">
          <span className="field__label">Employee</span>
          <select
            className="field__control"
            value={employeeId}
            onChange={(e) => setEmployeeId(e.target.value)}
          >
            <option value="all">All employees</option>
            {employeeOptions.map((emp) => (
              <option key={emp.id} value={emp.id}>
                {emp.name} ({emp.id}){emp.active === false ? " · inactive" : ""}
              </option>
            ))}
          </select>
        </label>

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
            <option value="Missed time-out">Missed time-out</option>
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

      {truncated && (
        <div className="alert alert--warning panel__alert" role="status">
          <AlertCircleIcon size={18} />
          <span>
            There are more records than can be shown for this period. Choose a
            shorter period to see all of them.
          </span>
        </div>
      )}

      {records.length === 0 ? (
        <div className="empty-state">
          <span className="empty-state__icon">
            <RecordsIcon size={22} />
          </span>
          <h3 className="empty-state__title">No attendance records in this period</h3>
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