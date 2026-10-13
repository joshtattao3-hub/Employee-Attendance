import { useToast } from "./useToast";
import { createId } from "../utils/id";
import { getLatestRecord, isToday, formatTime } from "../utils/attendance";

// Time In / Time Out rules. Receives the data instead of owning it.
export function useAttendance(employees, attendanceRecords, setAttendanceRecords) {
  const { showToast } = useToast();

  const getName = (employeeId) =>
    employees.find((e) => e.id === employeeId)?.name ?? "Employee";

  const isInactive = (employeeId) =>
    employees.find((e) => e.id === employeeId)?.active === false;

  function handleTimeIn(employeeId) {
    const latest = getLatestRecord(attendanceRecords, employeeId);
    const name = getName(employeeId);

        if (isInactive(employeeId)) {
      showToast("error", `${name} is deactivated and can't clock in or out.`);
      return;
    }
    
    // Validation 1: shift already open today
    if (latest && latest.timeOut === null && isToday(latest.timeIn)) {
      showToast("error", `${name} is already timed in.`);
      return;
    }

    // Validation 2: already finished a shift today
    if (latest && isToday(latest.timeIn)) {
      showToast("error", `${name} has already completed attendance today.`);
      return;
    }

    // (An open record from an earlier day is a missed time-out and
    //  does not block a new Time In.)
    const now = new Date().toISOString();
    const newRecord = {
      id: createId("rec"),
      employeeId,
      timeIn: now,
      timeOut: null,
    };

    setAttendanceRecords([...attendanceRecords, newRecord]);
    showToast("success", `${name} timed in at ${formatTime(now)}.`);
  }

  function handleTimeOut(employeeId) {
    const latest = getLatestRecord(attendanceRecords, employeeId);
    const name = getName(employeeId);

    // Validation 1: no shift today (never clocked in, or only an old missed one)
    if (!latest || !isToday(latest.timeIn)) {
      showToast("error", `${name} must time in first.`);
      return;
    }

    // Validation 2: already timed out
    if (latest.timeOut !== null) {
      showToast("error", `${name} is already timed out.`);
      return;
    }

    const now = new Date().toISOString();

    // Make a new array, replacing only the record we are closing
    const updated = attendanceRecords.map((record) =>
      record.id === latest.id ? { ...record, timeOut: now } : record
    );

    setAttendanceRecords(updated);
    showToast("success", `${name} timed out at ${formatTime(now)}.`);
  }

  return { handleTimeIn, handleTimeOut };
}