import { useData } from "../hooks/useData";
import { useAuth } from "../hooks/useAuth";
import { useClock } from "../hooks/useClock";
import {
  getStatus,
  getActionState,
  getTodayRecord,
  getLatestRecord,
  formatRecordDate,
  formatTime,
  formatDuration,
} from "../utils/attendance";
import LiveClock from "../components/LiveClock";
import Avatar from "../components/Avatar";
import StatusBadge from "../components/StatusBadge";
import ActionButton from "../components/ActionButton";
import RecordsTable from "../components/RecordsTable";
import { RecordsIcon, AlertCircleIcon } from "../components/Icons";
import { useMySchedule } from "../hooks/useMySchedule";
import { formatClock } from "../utils/shifts";

// Ticks every second, but only this tiny component re-renders.
// It counts against the DATABASE clock, so a wrong phone clock can't skew it.
function LiveDuration({ since, offsetMs }) {
  const now = useClock();
  return <>{formatDuration(now.getTime() + offsetMs - Date.parse(since))}</>;
}

function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

function MyDashboardPage({ onNavigate }) {
  const { currentUser } = useAuth();
  const {
    employees,
    attendanceRecords,
    handleTimeIn,
    handleTimeOut,
    serverOffsetMs,
    busy,
  } = useData();

  const employeeId = currentUser.employeeId;
  const employee = employees.find((e) => e.id === employeeId);
  const { todayShift, timeZone, shiftName } = useMySchedule();
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

  // Only this employee's data
  const myRecords = attendanceRecords.filter((r) => r.employeeId === employeeId);
  const todayRecord = getTodayRecord(attendanceRecords, employeeId);
  const status = getStatus(attendanceRecords, employeeId);
  const actions = getActionState(attendanceRecords, employeeId);
  const latest = getLatestRecord(attendanceRecords, employeeId);
  const missed = latest?.missed ? latest : null;

  let timer;
  if (!todayRecord) {
    timer = "0:00:00";
  } else if (todayRecord.open) {
    timer = <LiveDuration since={todayRecord.timeIn} offsetMs={serverOffsetMs} />;
  } else if (todayRecord.timeOut) {
    timer = formatDuration(Date.parse(todayRecord.timeOut) - Date.parse(todayRecord.timeIn));
  } else {
    timer = "—"; // a missed time-out has no end time
  }

  const hint =
    status === "Timed In"
      ? "You’re clocked in. Time out when your shift ends."
      : status === "Timed Out"
        ? "Your shift is complete for today. See you tomorrow."
        : status === "Missed time-out"
          ? "Today’s shift wasn’t closed in time. Ask your administrator to correct it."
          : "You haven’t clocked in yet today.";

  return (
    <>
      <LiveClock />

      {missed && (
        <div className="alert alert--warning" role="status">
          <AlertCircleIcon size={18} />
          <span>
            Your shift on {formatRecordDate(missed)} wasn’t closed in time and is marked
            as a missed time-out. Ask your administrator to correct it.
          </span>
        </div>
      )}

      <div className="employee-grid">
        <section className="card panel" aria-labelledby="profile-title">
          <div className="panel__header">
            <div>
              <h2 id="profile-title" className="panel__title">My profile</h2>
              <p className="panel__subtitle">
                {getGreeting()}, {currentUser.name.split(" ")[0]}
              </p>
            </div>
          </div>
          <div className="panel__body">
            <div className="profile">
              <Avatar name={employee.name} size="lg" />
              <div>
                <p className="profile__name">{employee.name}</p>
                <p className="profile__role">{employee.position || "—"}</p>
              </div>
            </div>
            <dl className="profile__details">
              <div><dt>Employee ID</dt><dd className="cell-id">{employee.id}</dd></div>
              <div><dt>Email</dt><dd>{employee.email ?? "—"}</dd></div>
              <div><dt>Branch</dt><dd>{employee.branchName}</dd></div>
              <div><dt>Position</dt><dd>{employee.position || "—"}</dd></div>
            </dl>
          </div>
        </section>

        <section className="card panel" aria-labelledby="today-title">
          <div className="panel__header">
            <div>
              <h2 id="today-title" className="panel__title">Today</h2>
              <p className="panel__subtitle">Your attendance for today</p>
            </div>
            <StatusBadge status={status} />
          </div>
          <div className="panel__body">
            <p className="today__label">Time worked today</p>
            <p className="today__timer" role="timer" aria-live="off">
              {timer}
            </p>

            <dl className="today__times">
              <div><dt>Time in</dt><dd>{formatTime(todayRecord?.timeIn)}</dd></div>
              <div><dt>Time out</dt><dd>{formatTime(todayRecord?.timeOut)}</dd></div>
            </dl>

            <dl className="today__times">
              <div>
                <dt>Scheduled shift</dt>
                <dd>
                  {todayShift
                    ? `${shiftName(todayShift)} · ${formatClock(todayShift.startAt, timeZone)} – ${formatClock(todayShift.endAt, timeZone)}`
                    : "No shift scheduled"}
                </dd>
              </div>
            </dl>

            <div className="today__actions">
              <ActionButton
                kind="in"
                size="lg"
                enabled={actions.canTimeIn && !busy}
                reason={busy ? "Please wait…" : actions.timeInReason}
                onClick={handleTimeIn}
              />
              <ActionButton
                kind="out"
                size="lg"
                enabled={actions.canTimeOut && !busy}
                reason={busy ? "Please wait…" : actions.timeOutReason}
                onClick={handleTimeOut}
              />
            </div>
            <p className="today__hint">{hint}</p>
          </div>
        </section>
      </div>

      <section className="card panel">
        <div className="panel__header">
          <div>
            <h2 className="panel__title">My recent activity</h2>
            <p className="panel__subtitle">Your latest 5 records</p>
          </div>
          <button
            type="button"
            className="btn-secondary"
            onClick={() => onNavigate("my-attendance")}
          >
            View all
          </button>
        </div>

        {myRecords.length === 0 ? (
          <div className="empty-state">
            <span className="empty-state__icon">
              <RecordsIcon size={22} />
            </span>
            <h3 className="empty-state__title">No activity yet</h3>
            <p className="empty-state__text">
              Your records appear here after you clock in.
            </p>
          </div>
        ) : (
          <RecordsTable records={myRecords.slice(-5)} showEmployee={false} />
        )}
      </section>
    </>
  );
}

export default MyDashboardPage;