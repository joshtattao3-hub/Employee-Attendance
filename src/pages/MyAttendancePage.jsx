import { useData } from "../hooks/useData";
import { useAuth } from "../hooks/useAuth";
import RecordsTable from "../components/RecordsTable";
import { RecordsIcon } from "../components/Icons";

function MyAttendancePage() {
  const { currentUser } = useAuth();
  const { attendanceRecords } = useData();

  // Only this employee's records, taken from the session
  const mine = attendanceRecords.filter(
    (r) => r.employeeId === currentUser.employeeId
  );

  const completedMs = mine.reduce(
    (sum, r) =>
      r.timeOut ? sum + (new Date(r.timeOut) - new Date(r.timeIn)) : sum,
    0
  );
  const completedHours = (completedMs / (1000 * 60 * 60)).toFixed(2);

  return (
    <section className="card panel">
      <div className="panel__header">
        <div>
          <h2 className="panel__title">My attendance</h2>
          <p className="panel__subtitle">
            {mine.length} {mine.length === 1 ? "record" : "records"} ·{" "}
            {completedHours} hours completed
          </p>
        </div>
      </div>

      {mine.length === 0 ? (
        <div className="empty-state">
          <span className="empty-state__icon">
            <RecordsIcon size={22} />
          </span>
          <h3 className="empty-state__title">No attendance records yet</h3>
          <p className="empty-state__text">
            Records appear here after you clock in from My Dashboard.
          </p>
        </div>
      ) : (
        <RecordsTable records={mine} showEmployee={false} />
      )}
    </section>
  );
}

export default MyAttendancePage;