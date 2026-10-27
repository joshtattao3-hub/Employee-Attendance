// Turns database rows into the shapes the screens use. Pure functions, so
// they are easy to test and never call the database themselves.

// "2026-10-25" for a moment in a given IANA time zone, e.g. "Asia/Manila"
export function dateKeyInZone(ms, timeZone) {
  try {
    return new Date(ms).toLocaleDateString("en-CA", { timeZone });
  } catch {
    return new Date(ms).toLocaleDateString("en-CA", { timeZone: "UTC" });
  }
}

export function mapEmployees(employeeRows, branchRows) {
  const branches = new Map(branchRows.map((b) => [b.id, b]));

  return employeeRows.map((row) => {
    const branch = branches.get(row.branch_id);
    const profile = Array.isArray(row.profile) ? row.profile[0] : row.profile;
    return {
      id: row.employee_code, // what people see: EMP001
      uuid: row.id, // what the database uses
      name: row.full_name,
      email: row.email,
      branchId: row.branch_id,
      branchName: branch?.name ?? "—",
      department: branch?.name ?? "—", // older screens show this column
      timezone: branch?.timezone ?? "UTC",
      position: row.job_title ?? "",
      active: row.active,
      hasLogin: Boolean(profile),
    };
  });
}

// nowMs is the DATABASE's "now" (device time corrected by the server offset).
export function mapRecords(rows, employees, branchRows, { nowMs, maxShiftHours }) {
  const byUuid = new Map(employees.map((e) => [e.uuid, e]));
  const zoneByBranch = new Map(branchRows.map((b) => [b.id, b.timezone]));
  const maxMs = maxShiftHours * 60 * 60 * 1000;

  return rows.map((row) => {
    const employee = byUuid.get(row.employee_id);
    const stale =
      row.clock_out === null &&
      !row.missed_timeout &&
      nowMs - Date.parse(row.clock_in) > maxMs;
    const missed = Boolean(row.missed_timeout) || stale;
    const zone = zoneByBranch.get(row.branch_id) ?? "UTC";

    return {
      id: row.id,
      employeeId: employee?.id ?? row.employee_id,
      timeIn: row.clock_in,
      timeOut: row.clock_out,
      workDate: row.work_date,
      source: row.source,
      missed,
      open: row.clock_out === null && !missed,
      today: row.work_date === dateKeyInZone(nowMs, zone),
    };
  });
}