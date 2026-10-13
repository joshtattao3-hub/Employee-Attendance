// Local calendar date as "YYYY-MM-DD", the same format <input type="date"> uses.
// ("en-CA" is the locale that formats dates in that order.)
export function getDateKey(iso) {
  return new Date(iso).toLocaleDateString("en-CA");
}

// Format an ISO timestamp as a readable date, e.g. "Oct 9, 2026"
export function formatDate(iso) {
  return new Date(iso).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
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

// Find the most recent record for one employee (or undefined if none)
export function getLatestRecord(records, employeeId) {
  const mine = records.filter((r) => r.employeeId === employeeId);
  return mine[mine.length - 1];
}

// Status is derived from the latest record, never stored separately
export function getStatus(records, employeeId) {
  const latest = getLatestRecord(records, employeeId);
  if (!latest) return "Not Timed In";
  if (latest.timeOut === null) return "Timed In";
  return "Timed Out";
}

// Is this ISO timestamp from today (in the user's local time)?
export function isToday(iso) {
  return new Date(iso).toDateString() === new Date().toDateString();
}
// "Mark Dela Cruz" -> "MC", "Maria" -> "MA"
export function getInitials(name) {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

// Status of a single history record
export function getRecordStatus(record) {
  return record.timeOut === null ? "In progress" : "Completed";
}

// Numbers for the dashboard cards, calculated fresh from the real data
export function getSummary(employees, records) {
  const total = employees.length;

  // Employees whose latest record is still open
  const clockedIn = employees.filter(
    (emp) => getStatus(records, emp.id) === "Timed In"
  ).length;

  // Records from today that have a time-out
  const completed = records.filter(
    (r) => r.timeOut !== null && isToday(r.timeIn)
  ).length;

  // Employees with no record today and no open shift
  const notYet = employees.filter((emp) => {
    const latest = getLatestRecord(records, emp.id);
    return !latest || (latest.timeOut !== null && !isToday(latest.timeIn));
  }).length;

  return { total, clockedIn, completed, notYet };
}
// Which actions are valid for one employee right now, and why not if blocked.
// Mirrors the rules in handleTimeIn / handleTimeOut.
export function getActionState(records, employeeId) {
  const latest = getLatestRecord(records, employeeId);

  // Never clocked in
  if (!latest) {
    return {
      canTimeIn: true,
      canTimeOut: false,
      timeInReason: "",
      timeOutReason: "Clock in first",
    };
  }

  // Currently clocked in (open record)
  if (latest.timeOut === null) {
    return {
      canTimeIn: false,
      canTimeOut: true,
      timeInReason: "Already clocked in",
      timeOutReason: "",
    };
  }

  // Already clocked out: can only clock in again on a later day
  const finishedToday = isToday(latest.timeIn);
  return {
    canTimeIn: !finishedToday,
    canTimeOut: false,
    timeInReason: finishedToday ? "Shift already completed today" : "",
    timeOutReason: "Already clocked out",
  };
}
