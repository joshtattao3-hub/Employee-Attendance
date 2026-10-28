import { useMySchedule } from "../hooks/useMySchedule";
import { CalendarIcon } from "../components/Icons";
import { addDays, formatClock, formatDay, formatDuration, weekStartOf } from "../utils/shifts";

function paidMinutes(s) {
  const length = (Date.parse(s.endAt) - Date.parse(s.startAt)) / 60000;
  return Math.max(0, length - (s.breakMinutes ?? 0));
}

function MySchedulePage() {
  const { employee, timeZone, today, mine, upcoming, shiftName } = useMySchedule();

  if (!employee) {
    return (
      <section className="card panel">
        <div className="panel__header">
          <div>
            <h2 className="panel__title">No employee record</h2>
            <p className="panel__subtitle">Your account isn’t linked to an employee</p>
          </div>
        </div>
        <div className="panel__body">
          <p className="modal__text">
            Ask your administrator to link your login to an employee record.
          </p>
        </div>
      </section>
    );
  }

  // Paid hours for the current Monday-to-Sunday week
  const weekStart = weekStartOf(today);
  const weekEnd = addDays(weekStart, 6);
  const weekMinutes = mine
    .filter((s) => s.workDate >= weekStart && s.workDate <= weekEnd)
    .reduce((sum, s) => sum + paidMinutes(s), 0);

  return (
    <section className="card panel">
      <div className="panel__header">
        <div>
          <h2 className="panel__title">My schedule</h2>
          <p className="panel__subtitle">
            {upcoming.length} upcoming {upcoming.length === 1 ? "shift" : "shifts"} ·{" "}
            {formatDuration(weekMinutes)} scheduled this week
          </p>
          <p className="panel__subtitle">
            Times are in your branch’s time zone. Shows up to 8 weeks ahead.
          </p>
        </div>
      </div>

      {upcoming.length === 0 ? (
        <div className="empty-state">
          <span className="empty-state__icon">
            <CalendarIcon size={22} />
          </span>
          <h3 className="empty-state__title">No upcoming shifts</h3>
          <p className="empty-state__text">
            Nothing is scheduled for you yet. Your manager will add shifts here.
          </p>
        </div>
      ) : (
        <div className="table-wrapper">
          <table className="data-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Shift</th>
                <th>Time</th>
                <th>Break</th>
                <th>Paid hours</th>
              </tr>
            </thead>
            <tbody>
              {upcoming.map((s) => (
                <tr key={s.id}>
                  <td>
                    <span className={s.workDate === today ? "employee-cell__name" : undefined}>
                      {formatDay(s.workDate)}
                      {s.workDate === today && " (today)"}
                    </span>
                  </td>
                  <td>{shiftName(s)}</td>
                  <td className="cell-id">
                    {formatClock(s.startAt, timeZone)} – {formatClock(s.endAt, timeZone)}
                  </td>
                  <td>{s.breakMinutes ?? 0} min</td>
                  <td>{formatDuration(paidMinutes(s))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

export default MySchedulePage;