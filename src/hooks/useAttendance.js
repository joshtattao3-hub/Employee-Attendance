import { useState, useCallback } from "react";
import { employees } from "../data/employees";
import { getLatestRecord, isToday, formatTime } from "../utils/attendance";

export function useAttendance() {
  const [attendanceRecords, setAttendanceRecords] = useState([]);
  const [message, setMessage] = useState(null);
  const clearMessage = useCallback(() => setMessage(null), []);

  const getName = (employeeId) =>
    employees.find((e) => e.id === employeeId).name;

  function handleTimeIn(employeeId) {
    const latest = getLatestRecord(attendanceRecords, employeeId);
    const name = getName(employeeId);

    // Validation 1: already timed in (open record)
    if (latest && latest.timeOut === null) {
      setMessage({ type: "error", text: `${name} is already timed in.` });
      return;
    }

    // Validation 2: already finished a shift today
    if (latest && isToday(latest.timeIn)) {
      setMessage({
        type: "error",
        text: `${name} has already completed attendance today.`,
      });
      return;
    }

    const now = new Date().toISOString();
    const newRecord = {
      id: attendanceRecords.length + 1,
      employeeId,
      timeIn: now,
      timeOut: null,
    };

    setAttendanceRecords([...attendanceRecords, newRecord]);
    setMessage({
      type: "success",
      text: `${name} timed in at ${formatTime(now)}.`,
    });
  }

  function handleTimeOut(employeeId) {
    const latest = getLatestRecord(attendanceRecords, employeeId);
    const name = getName(employeeId);

    // Validation 1: never timed in
    if (!latest) {
      setMessage({ type: "error", text: `${name} must time in first.` });
      return;
    }

    // Validation 2: already timed out
    if (latest.timeOut !== null) {
      setMessage({ type: "error", text: `${name} is already timed out.` });
      return;
    }

    const now = new Date().toISOString();

    // Make a new array, replacing only the record we are closing
    const updated = attendanceRecords.map((record) =>
      record.id === latest.id ? { ...record, timeOut: now } : record
    );

    setAttendanceRecords(updated);
    setMessage({
      type: "success",
      text: `${name} timed out at ${formatTime(now)}.`,
    });
  }

  return { attendanceRecords, message, clearMessage, handleTimeIn, handleTimeOut };
}