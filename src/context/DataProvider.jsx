import { useCallback } from "react";
import { DataContext } from "./dataContext";
import { useLocalStorage } from "../hooks/useLocalStorage";
import { useAttendance } from "../hooks/useAttendance";
import { seedEmployees, createSeedRecords } from "../data/seed";
import { seedAccounts } from "../data/accounts";
import { getNextEmployeeId } from "../utils/id";

const EMPLOYEES_KEY = "hirara:v1:employees";
const RECORDS_KEY = "hirara:v1:records";
const ACCOUNTS_KEY = "hirara:v1:accounts";

const isAccountList = (v) =>
  Array.isArray(v) &&
  v.every(
    (a) =>
      a &&
      typeof a.id === "string" &&
      typeof a.email === "string" &&
      typeof a.passwordHash === "string" &&
      typeof a.salt === "string" &&
      (a.role === "admin" || a.role === "employee")
  );

// Reject stored data with the wrong shape (for example, hand-edited values)
const isEmployeeList = (v) =>
  Array.isArray(v) &&
  v.every((e) => e && typeof e.id === "string" && typeof e.name === "string");

const isRecordList = (v) =>
  Array.isArray(v) &&
  v.every(
    (r) =>
      r &&
      typeof r.id === "string" &&
      typeof r.employeeId === "string" &&
      typeof r.timeIn === "string"
  );
const normalizeEmail = (value) => value.trim().toLowerCase();
const cleanText = (value) => value.trim().replace(/\s+/g, " ");

// An email is taken if another employee or another person's account uses it
function isEmailTaken(employees, accounts, email, ignoreEmployeeId = null) {
  return (
    employees.some(
      (e) => e.id !== ignoreEmployeeId && e.email?.toLowerCase() === email
    ) ||
    accounts.some((a) => a.email === email && a.employeeId !== ignoreEmployeeId)
  );
}

export function DataProvider({ children }) {
  const [employees, setEmployees] = useLocalStorage(
    EMPLOYEES_KEY,
    seedEmployees,
    isEmployeeList
  );
  const [attendanceRecords, setAttendanceRecords] = useLocalStorage(
    RECORDS_KEY,
    createSeedRecords,
    isRecordList
  );

  const [accounts, setAccounts] = useLocalStorage(
    ACCOUNTS_KEY,
    seedAccounts,
    isAccountList
  );

  const { handleTimeIn, handleTimeOut } = useAttendance(
    employees,
    attendanceRecords,
    setAttendanceRecords
  );

  const resetDemoData = useCallback(() => {
    setEmployees(seedEmployees);
    setAttendanceRecords(createSeedRecords());
    setAccounts(seedAccounts);
  }, [setEmployees, setAttendanceRecords, setAccounts]);

    const addEmployee = useCallback(
    ({ name, email, department, position }) => {
      const normalized = normalizeEmail(email);
      if (isEmailTaken(employees, accounts, normalized)) {
        return {
          ok: false,
          field: "email",
          error: "Another employee or account already uses this email.",
        };
      }

      const employee = {
        id: getNextEmployeeId(employees),
        name: cleanText(name),
        email: normalized,
        department: cleanText(department),
        position: cleanText(position),
        active: true,
      };
      setEmployees((prev) => [...prev, employee]);
      return { ok: true, employee };
    },
    [employees, accounts, setEmployees]
  );

  const updateEmployee = useCallback(
    (id, { name, email, department, position }) => {
      const current = employees.find((e) => e.id === id);
      if (!current) return { ok: false, error: "Employee not found." };

      const normalized = normalizeEmail(email);
      const emailChanged = normalized !== (current.email ?? "").toLowerCase();

      if (emailChanged) {
        if (accounts.some((a) => a.employeeId === id)) {
          return {
            ok: false,
            field: "email",
            error: "This employee has an account, so their email can’t be changed here.",
          };
        }
        if (isEmailTaken(employees, accounts, normalized, id)) {
          return {
            ok: false,
            field: "email",
            error: "Another employee or account already uses this email.",
          };
        }
      }

      const updated = {
        ...current,
        name: cleanText(name),
        email: emailChanged ? normalized : current.email,
        department: cleanText(department),
        position: cleanText(position),
      };
      setEmployees((prev) => prev.map((e) => (e.id === id ? updated : e)));
      return { ok: true, employee: updated };
    },
    [employees, accounts, setEmployees]
  );

  const setEmployeeActive = useCallback(
    (id, active) => {
      setEmployees((prev) =>
        prev.map((e) => (e.id === id ? { ...e, active } : e))
      );
    },
    [setEmployees]
  );

    const value = {
    employees,
    setEmployees,
    addEmployee,
    updateEmployee,
    setEmployeeActive,
    attendanceRecords,
    accounts,
    setAccounts,
    handleTimeIn,
    handleTimeOut,
    resetDemoData,
  };

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}