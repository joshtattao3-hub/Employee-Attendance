import { employees } from "../data/employees";
import RecordsTable from "./RecordsTable";
import { RecordsIcon } from "./Icons";

const PREVIEW_COUNT = 5;

function RecentActivity({ records, onViewAll }) {
  // The last 5 records (the table puts the newest on top)
  const recent = records.slice(-PREVIEW_COUNT);

  return (
    <section className="card panel">
      <div className="panel__header">
        <div>
          <h2 className="panel__title">Recent activity</h2>
          <p className="panel__subtitle">Latest {PREVIEW_COUNT} attendance records</p>
        </div>
        <button type="button" className="btn-secondary" onClick={onViewAll}>
          View all records
        </button>
      </div>

      {records.length === 0 ? (
        <div className="empty-state">
          <span className="empty-state__icon">
            <RecordsIcon size={22} />
          </span>
          <h3 className="empty-state__title">No activity yet</h3>
          <p className="empty-state__text">
            Records appear here as soon as an employee clocks in.
          </p>
        </div>
      ) : (
        <RecordsTable records={recent} employees={employees} />
      )}
    </section>
  );
}

export default RecentActivity;