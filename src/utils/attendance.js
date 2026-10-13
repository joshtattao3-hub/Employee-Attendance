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

// Status for TODAY. Older records (including missed time-outs) don't count.
export function getStatus(records, employeeId) {
  const latest = getLatestRecord(records, employeeId);
  if (!latest || !isToday(latest.timeIn)) return "Not Timed In";
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
  if (record.timeOut !== null) return "Completed";
  return isToday(record.timeIn) ? "In progress" : "Missed time-out";
}

export function getSummary(employees, records) {
  // Deactivated employees don't count toward today's numbers
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
    (r) =>
      activeIds.has(r.employeeId) && r.timeOut !== null && isToday(r.timeIn)
  ).length;

  return { total, clockedIn, completed, notYet };
}
// Which actions are valid for one employee right now, and why not if blocked.
// Mirrors the rules in handleTimeIn / handleTimeOut.
export function getActionState(records, employeeId) {
  const latest = getLatestRecord(records, employeeId);

  // Nothing today: no record, or only older days
  if (!latest || !isToday(latest.timeIn)) {
    return {
      canTimeIn: true,
      canTimeOut: false,
      timeInReason: "",
      timeOutReason: "Clock in first",
    };
  }

  // Clocked in today and not yet out
  if (latest.timeOut === null) {
    return {
      canTimeIn: false,
      canTimeOut: true,
      timeInReason: "Already clocked in",
      timeOutReason: "",
    };
  }

  // Finished today
  return {
    canTimeIn: false,
    canTimeOut: false,
    timeInReason: "Shift already completed today",
    timeOutReason: "Already clocked out",
  };
}

export function isMissedTimeOut(record) {
  return record.timeOut === null && !isToday(record.timeIn);
}

// "0:07:05" style duration from milliseconds
export function formatDuration(ms) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

// The employee's record for today, or null
export function getTodayRecord(records, employeeId) {
  const latest = getLatestRecord(records, employeeId);
  return latest && isToday(latest.timeIn) ? latest : null;
}