// ---------- Formatting ----------

// Format an ISO timestamp as a readable date, e.g. "Oct 9, 2026"
export function formatDate(iso) {
  return new Date(iso).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

// A record's date is its WORK date (the branch's calendar day), not the
// phone's. "2026-10-25" is shown at local noon so no time zone can shift it.
export function formatRecordDate(record) {
  return record.workDate
    ? formatDate(`${record.workDate}T12:00:00`)
    : formatDate(record.timeIn);
}

// Format an ISO timestamp as a readable time, e.g. "08:30 AM"
export function formatTime(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

// Hours worked, only when both times exist
export function calculateHours(timeIn, timeOut) {
  if (!timeIn || !timeOut) return "—";
  const hours = (new Date(timeOut) - new Date(timeIn)) / (1000 * 60 * 60);
  return `${hours.toFixed(2)} hrs`;
}

// "0:07:05" style duration from milliseconds
export function formatDuration(ms) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

// "Mark Dela Cruz" -> "MC", "Maria" -> "MA"
export function getInitials(name) {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

// Is this ISO timestamp from today on THIS device's calendar?
export function isToday(iso) {
  return new Date(iso).toDateString() === new Date().toDateString();
}

// Local calendar date as "YYYY-MM-DD", the same format <input type="date"> uses.
export function getDateKey(iso) {
  return new Date(iso).toLocaleDateString("en-CA");
}

// ---------- Attendance rules ----------
// Records come from the database, already marked by the data layer with:
//   open    a shift that is running now
//   missed  a shift that was never closed in time (a "missed time-out")
//   today   the record belongs to today's WORK date at its branch
// Records are kept oldest first, so the last one is the latest.

// Find the most recent record for one employee (or undefined if none)
export function getLatestRecord(records, employeeId) {
  const mine = records.filter((r) => r.employeeId === employeeId);
  return mine[mine.length - 1];
}

// The employee's status right now
export function getStatus(records, employeeId) {
  const latest = getLatestRecord(records, employeeId);
  if (!latest) return "Not Timed In";
  if (latest.open) return "Timed In"; // includes a shift that started yesterday
  if (latest.today) return latest.missed ? "Missed time-out" : "Timed Out";
  return "Not Timed In";
}

// Status of a single history record
export function getRecordStatus(record) {
  if (record.open) return "In progress";
  return record.missed ? "Missed time-out" : "Completed";
}

// A shift that was never closed
export function isMissedTimeOut(record) {
  return Boolean(record.missed);
}

// The record to show as "today": the open shift, or today's shift
export function getTodayRecord(records, employeeId) {
  const latest = getLatestRecord(records, employeeId);
  return latest && (latest.open || latest.today) ? latest : null;
}

// Which actions make sense right now (the server enforces the same rules)
export function getActionState(records, employeeId) {
  const latest = getLatestRecord(records, employeeId);

  if (latest?.open) {
    return {
      canTimeIn: false,
      canTimeOut: true,
      timeInReason: "Already clocked in",
      timeOutReason: "",
    };
  }

  if (latest?.today) {
    return {
      canTimeIn: false,
      canTimeOut: false,
      timeInReason: latest.missed
        ? "Today’s shift was flagged as a missed time-out"
        : "Shift already completed today",
      timeOutReason: latest.missed
        ? "Ask your administrator to correct it"
        : "Already clocked out",
    };
  }

  return {
    canTimeIn: true,
    canTimeOut: false,
    timeInReason: "",
    timeOutReason: "Clock in first",
  };
}

// Numbers for the dashboard cards, calculated fresh from the real data.
// Deactivated employees are left out.
export function getSummary(employees, records) {
  const active = employees.filter((e) => e.active !== false);
  const activeIds = new Set(active.map((e) => e.id));

  const total = active.length;
  const clockedIn = active.filter(
    (emp) => getStatus(records, emp.id) === "Timed In"
  ).length;
  const notYet = active.filter(
    (emp) => getStatus(records, emp.id) === "Not Timed In"
  ).length;
  const completed = records.filter(
    (r) => activeIds.has(r.employeeId) && r.today && r.timeOut !== null
  ).length;

  return { total, clockedIn, completed, notYet };
}