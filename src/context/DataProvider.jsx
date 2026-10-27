import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DataContext } from "./dataContext";
import { useAuth } from "../hooks/useAuth";
import { useToast } from "../hooks/useToast";
import { supabase } from "../lib/supabase";
import { mapEmployees, mapRecords } from "../utils/attendanceData";
import { formatTime } from "../utils/attendance";

const DAY_MS = 24 * 60 * 60 * 1000;
const PAGE_SIZE = 1000; // the database returns at most this many rows per request
const MAX_PAGES = 20;
const MIN_REFRESH_GAP_MS = 10_000;

// Attendance can be more than one request's worth, so read it page by page.
async function fetchAttendance(sinceIso) {
  const rows = [];
  for (let page = 0; page < MAX_PAGES; page++) {
    const from = page * PAGE_SIZE;
    const { data, error } = await supabase
      .from("attendance")
      .select("id, employee_id, branch_id, work_date, clock_in, clock_out, missed_timeout, source")
      .gte("clock_in", sinceIso)
      .order("clock_in", { ascending: false })
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    rows.push(...data);
    if (data.length < PAGE_SIZE) return { rows, truncated: false };
  }
  return { rows, truncated: true };
}

// Everything the screens need. Row-level security decides what each person
// actually receives: an admin gets everyone, a manager their branch, an
// employee only themselves.
async function loadEverything(rangeDays) {
  const startedAt = Date.now();
  const since = new Date(startedAt - rangeDays * DAY_MS).toISOString();

  const [employeeRes, branchRes, settingsRes, timeRes, attendance] = await Promise.all([
    supabase
      .from("employees")
      .select("id, employee_code, full_name, email, branch_id, job_title, active, profile:profiles(id)")
      .order("employee_code"),
    supabase.from("branches").select("id, name, timezone, active").order("name"),
    supabase.from("company_settings").select("max_shift_hours").eq("id", 1).maybeSingle(),
    supabase.rpc("server_time"),
    fetchAttendance(since),
  ]);

  for (const res of [employeeRes, branchRes, settingsRes, timeRes]) {
    if (res.error) throw res.error;
  }

  // How far this device's clock is from the database clock
  const finishedAt = Date.now();
  const offsetMs = Date.parse(timeRes.data) - (startedAt + finishedAt) / 2;
  const nowMs = finishedAt + offsetMs;
  const maxShiftHours = settingsRes.data?.max_shift_hours ?? 16;

  const employees = mapEmployees(employeeRes.data, branchRes.data);
  // Oldest first: the last record of a person is their latest.
  const attendanceRecords = mapRecords(
    [...attendance.rows].reverse(),
    employees,
    branchRes.data,
    { nowMs, maxShiftHours }
  );

  return {
    employees,
    branches: branchRes.data,
    attendanceRecords,
    serverOffsetMs: offsetMs,
    truncated: attendance.truncated,
  };
}

const CLOCK_ERRORS = {
  already_clocked_in: "You’re already clocked in.",
  already_completed_today: "You’ve already completed your shift today.",
  not_clocked_in:
    "You don’t have an open shift to close. If a shift was left open too long, ask your administrator to correct it.",
  no_employee: "Your account isn’t linked to an active employee record.",
  not_signed_in: "Your session has ended. Sign in again.",
};

function friendlyClockError(error) {
  return (
    CLOCK_ERRORS[error.message] ??
    "We couldn’t record that. Check your connection and try again."
  );
}

function employeeError(error) {
  if (error.message === "email_locked") {
    return {
      ok: false,
      field: "email",
      error: "This employee has a login, so their email can’t be changed here.",
    };
  }
  if (error.code === "23505") {
    return { ok: false, field: "email", error: "Another employee already uses this email." };
  }
  if (error.code === "42501") {
    return { ok: false, error: "You don’t have permission to do that." };
  }
  return { ok: false, error: "We couldn’t save that. Check your connection and try again." };
}

const clean = (text) => text.trim().replace(/\s+/g, " ");

export function DataProvider({ children }) {
  const { currentUser } = useAuth();
  const { showToast } = useToast();
  const userId = currentUser?.id ?? null;

  const [rangeDays, setRangeDays] = useState(31);
  const [reloadKey, setReloadKey] = useState(0);
  // The loaded data belongs to one person. If someone else signs in, it no
  // longer matches and the app counts as loading.
  const [loaded, setLoaded] = useState({ userId: null, data: null, error: false });
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);

  // Load (and quietly reload) the data
  useEffect(() => {
    if (!supabase || !userId) return;
    let cancelled = false;

    (async () => {
      try {
        const data = await loadEverything(rangeDays);
        if (cancelled) return;
        setLoaded({ userId, data, error: false });
      } catch {
        if (cancelled) return;
        setLoaded((prev) =>
          prev.userId === userId && prev.data
            ? { ...prev, error: true }
            : { userId, data: null, error: true }
        );
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [userId, rangeDays, reloadKey]);

  // Refresh when the person comes back to this tab or window
  useEffect(() => {
    if (!userId) return;
    let last = 0;
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      const now = Date.now();
      if (now - last < MIN_REFRESH_GAP_MS) return;
      last = now;
      setReloadKey((key) => key + 1);
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [userId]);

  const hasData = Boolean(userId) && loaded.userId === userId && loaded.data !== null;
  let status = "loading";
  if (!userId) status = "idle";
  else if (hasData) status = "ready";
  else if (loaded.userId === userId && loaded.error) status = "error";

  const data = hasData ? loaded.data : null;
  const refreshFailed = hasData && loaded.error;

  const reload = useCallback(() => {
    setLoaded({ userId: null, data: null, error: false });
    setReloadKey((key) => key + 1);
  }, []);

  // ---- clock in / clock out: the server decides, using the database clock ----
  const runClock = useCallback(
    async (functionName, verb) => {
      if (!supabase || inFlight.current) return { ok: false };
      inFlight.current = true;
      setBusy(true);

      const { data: row, error } = await supabase.rpc(functionName);

      inFlight.current = false;
      setBusy(false);
      setReloadKey((key) => key + 1); // the truth may have changed, either way

      if (error) {
        showToast("error", friendlyClockError(error));
        return { ok: false };
      }
      // The result is one record; accept it wrapped in a list too.
      const record = Array.isArray(row) ? row[0] : row;
      showToast(
        "success",
        `You timed ${verb} at ${formatTime(verb === "in" ? record?.clock_in : record?.clock_out)}.`
      );
      return { ok: true };
    },
    [showToast]
  );

  const handleTimeIn = useCallback(() => runClock("clock_in", "in"), [runClock]);
  const handleTimeOut = useCallback(() => runClock("clock_out", "out"), [runClock]);

  // ---- administrators: manage employees ----
  const employees = data?.employees;

  const addEmployee = useCallback(async ({ name, email, branchId, position }) => {
    const { data: row, error } = await supabase
      .from("employees")
      .insert({
        full_name: clean(name),
        email: email.trim().toLowerCase(),
        branch_id: branchId,
        job_title: clean(position) || null,
      })
      .select("employee_code, full_name")
      .single();
    if (error) return employeeError(error);

    setReloadKey((key) => key + 1);
    return { ok: true, employee: { id: row.employee_code, name: row.full_name } };
  }, []);

  const updateEmployee = useCallback(
    async (code, { name, email, branchId, position }) => {
      const target = employees?.find((e) => e.id === code);
      if (!target) return { ok: false, error: "Employee not found." };

      const changes = {
        full_name: clean(name),
        branch_id: branchId,
        job_title: clean(position) || null,
      };
      // Only send the email if it changed (it is locked once a login exists)
      const nextEmail = email.trim().toLowerCase();
      if (nextEmail !== target.email) changes.email = nextEmail;

      const { error } = await supabase.from("employees").update(changes).eq("id", target.uuid);
      if (error) return employeeError(error);

      setReloadKey((key) => key + 1);
      return { ok: true, employee: { id: code, name: changes.full_name } };
    },
    [employees]
  );

  const setEmployeeActive = useCallback(
    async (code, active) => {
      const target = employees?.find((e) => e.id === code);
      if (!target) return { ok: false, error: "Employee not found." };

      const { error } = await supabase.from("employees").update({ active }).eq("id", target.uuid);
      if (error) return employeeError(error);

      setReloadKey((key) => key + 1);
      return { ok: true };
    },
    [employees]
  );

  const value = useMemo(
    () => ({
      status,
      refreshFailed,
      employees: data?.employees ?? [],
      branches: data?.branches ?? [],
      attendanceRecords: data?.attendanceRecords ?? [],
      serverOffsetMs: data?.serverOffsetMs ?? 0,
      truncated: data?.truncated ?? false,
      rangeDays,
      setRangeDays,
      busy,
      reload,
      handleTimeIn,
      handleTimeOut,
      addEmployee,
      updateEmployee,
      setEmployeeActive,
    }),
    [
      status, refreshFailed, data, rangeDays, busy, reload,
      handleTimeIn, handleTimeOut, addEmployee, updateEmployee, setEmployeeActive,
    ]
  );

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}