import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DataContext } from "./dataContext";
import { useAuth } from "../hooks/useAuth";
import { useToast } from "../hooks/useToast";
import { supabase } from "../lib/supabase";
import { mapEmployees, mapRecords } from "../utils/attendanceData";
import { formatTime } from "../utils/attendance";
import { addDays, dateKey } from "../utils/shifts";

const DAY_MS = 24 * 60 * 60 * 1000;
const PAGE_SIZE = 1000; // the database returns at most this many rows per request
const MAX_PAGES = 20;
const MIN_REFRESH_GAP_MS = 10_000;
const SCHEDULE_PAST_DAYS = 14; // Schedules are loaded for a window around today: a little history, and
const SCHEDULE_FUTURE_DAYS = 56; // several weeks ahead.

async function fetchSchedules(fromDate, toDate) {
  const rows = [];
  for (let page = 0; page < MAX_PAGES; page++) {
    const from = page * PAGE_SIZE;
    const { data, error } = await supabase
      .from("schedules")
      .select("id, employee_id, branch_id, template_id, work_date, start_at, end_at, break_minutes")
      .gte("work_date", fromDate)
      .lte("work_date", toDate)
      .order("work_date")
      .order("start_at")
      .order("id") // a tie-breaker keeps the pages stable
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    rows.push(...data);
    if (data.length < PAGE_SIZE) break;
  }
  return rows;
}

function mapSchedule(row) {
  return {
    id: row.id,
    employeeUuid: row.employee_id,
    branchId: row.branch_id,
    templateId: row.template_id,
    workDate: row.work_date, // "YYYY-MM-DD"
    startAt: row.start_at,
    endAt: row.end_at,
    breakMinutes: row.break_minutes,
  };
}

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

  const [employeeRes, branchRes, settingsRes, timeRes, templateRes, attendance] = await Promise.all([
  supabase
    .from("employees")
    .select("id, employee_code, full_name, email, branch_id, job_title, active, profile:profiles(id)")
    .order("employee_code"),
  supabase.from("branches").select("id, name, address, timezone, active").order("name"),
  supabase.from("company_settings").select("max_shift_hours").eq("id", 1).maybeSingle(),
  supabase.rpc("server_time"),
  supabase
    .from("shift_templates")
    .select("id, name, start_time, end_time, break_minutes, crosses_midnight, active")
    .order("start_time")
    .order("name"),
  fetchAttendance(since),
  ]);

  for (const res of [employeeRes, branchRes, settingsRes, timeRes, templateRes]) {
    if (res.error) throw res.error;
  }

  // How far this device's clock is from the database clock
  const finishedAt = Date.now();
  const offsetMs = Date.parse(timeRes.data) - (startedAt + finishedAt) / 2;
  const nowMs = finishedAt + offsetMs;
  const maxShiftHours = settingsRes.data?.max_shift_hours ?? 16;

  // Schedules: a window around today, counted by the database clock
  const today = dateKey(new Date(nowMs));
  const scheduleWindow = {
    from: addDays(today, -SCHEDULE_PAST_DAYS),
    to: addDays(today, SCHEDULE_FUTURE_DAYS),
  };

const scheduleRows = await fetchSchedules(scheduleWindow.from, scheduleWindow.to);

  const employees = mapEmployees(employeeRes.data, branchRes.data);
  // Oldest first: the last record of a person is their latest.
  const attendanceRecords = mapRecords(
    [...attendance.rows].reverse(),
    employees,
    branchRes.data,
    { nowMs, maxShiftHours }
  );

  // Postgres sends times as "08:00:00"; the screens only need "08:00".
  const shiftTemplates = templateRes.data.map((t) => ({
    id: t.id,
    name: t.name,
    startTime: t.start_time.slice(0, 5),
    endTime: t.end_time.slice(0, 5),
    breakMinutes: t.break_minutes,
    crossesMidnight: t.crosses_midnight,
    active: t.active,
  }));

  return {
    employees,
    branches: branchRes.data,
    shiftTemplates,
    attendanceRecords,
    serverOffsetMs: offsetMs,
    truncated: attendance.truncated,
    schedules: scheduleRows.map(mapSchedule),
    scheduleWindow,
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

function branchError(error) {
  if (error.code === "23505") {
    return { ok: false, field: "name", error: "Another branch already uses this name." };
  }
  if (error.code === "22023") {
    return { ok: false, field: "timezone", error: "That time zone isn’t recognized." };
  }
  if (error.code === "42501") {
    return { ok: false, error: "You don’t have permission to do that." };
  }
  return { ok: false, error: "We couldn’t save that. Check your connection and try again." };
}

function templateError(error) {
  if (error.code === "23505") {
    return { ok: false, field: "name", error: "Another shift already uses this name." };
  }
  if (error.code === "23514") {
    return { ok: false, error: "Check the name and break length, then try again." };
  }
  if (error.code === "42501") {
    return { ok: false, error: "You don’t have permission to do that." };
  }
  return { ok: false, error: "We couldn’t save that. Check your connection and try again." };
}

const SCHEDULE_ERRORS = {
  not_signed_in: "Your session has ended. Sign in again.",
  not_allowed: "You don’t have permission to change this schedule.",
  employee_not_found: "That employee isn’t in your team.",
  employee_inactive: "This employee is inactive, so they can’t be scheduled.",
  date_in_past: "Past days can’t be changed.",
  template_not_found: "That shift isn’t available any more. Pick another one.",
  template_inactive: "That shift is switched off. Pick another one.",
  overnight_not_supported: "Overnight shifts aren’t supported yet.",
  shift_in_use: "This person already clocked in for this shift, so it can’t be changed.",
  invalid_date: "That date isn’t valid.",
};

function scheduleError(error) {
  if (error.code === "42501") {
    return { ok: false, error: SCHEDULE_ERRORS.not_allowed };
  }
  return {
    ok: false,
    error:
      SCHEDULE_ERRORS[error.message] ??
      "We couldn’t save that. Check your connection and try again.",
  };
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

    // ---- administrators: manage branches ----
  const addBranch = useCallback(async ({ name, address, timezone }) => {
    const { data: row, error } = await supabase
      .from("branches")
      .insert({ name: clean(name), address: clean(address) || null, timezone })
      .select("name")
      .single();
    if (error) return branchError(error);

    setReloadKey((key) => key + 1);
    return { ok: true, branch: { name: row.name } };
  }, []);

  const updateBranch = useCallback(async (id, { name, address, timezone }) => {
    const { error } = await supabase
      .from("branches")
      .update({ name: clean(name), address: clean(address) || null, timezone })
      .eq("id", id);
    if (error) return branchError(error);

    setReloadKey((key) => key + 1);
    return { ok: true, branch: { name: clean(name) } };
  }, []);

  // ---- administrators: manage shift templates ----
  const addShiftTemplate = useCallback(async ({ name, startTime, endTime, breakMinutes }) => {
    const { data: row, error } = await supabase
      .from("shift_templates")
      .insert({
        name: clean(name),
        start_time: startTime,
        end_time: endTime,
        break_minutes: breakMinutes,
      })
      .select("name")
      .single();
    if (error) return templateError(error);

    setReloadKey((key) => key + 1);
    return { ok: true, template: { name: row.name } };
  }, []);

  const updateShiftTemplate = useCallback(
    async (id, { name, startTime, endTime, breakMinutes }) => {
      const { error } = await supabase
        .from("shift_templates")
        .update({
          name: clean(name),
          start_time: startTime,
          end_time: endTime,
          break_minutes: breakMinutes,
        })
        .eq("id", id);
      if (error) return templateError(error);

      setReloadKey((key) => key + 1);
      return { ok: true, template: { name: clean(name) } };
    },
    []
  );

  const setShiftTemplateActive = useCallback(async (id, active) => {
    const { error } = await supabase.from("shift_templates").update({ active }).eq("id", id);
    if (error) return templateError(error);

    setReloadKey((key) => key + 1);
    return { ok: true };
  }, []);

  // ---- managers and administrators: schedules ----
const setSchedule = useCallback(async (employeeUuid, workDate, templateId) => {
  const { data: row, error } = await supabase.rpc("set_schedule", {
    p_employee_id: employeeUuid,
    p_work_date: workDate,
    p_template_id: templateId,
  });
  if (error) return scheduleError(error);

  const saved = mapSchedule(Array.isArray(row) ? row[0] : row);
  setLoaded((prev) => {
    if (!prev.data) return prev;
    const others = prev.data.schedules.filter((s) => s.id !== saved.id);
    return { ...prev, data: { ...prev.data, schedules: [...others, saved] } };
  });
  return { ok: true };
}, []);

  const clearSchedule = useCallback(async (employeeUuid, workDate) => {
    const { error } = await supabase.rpc("clear_schedule", {
      p_employee_id: employeeUuid,
      p_work_date: workDate,
    });
    if (error) return scheduleError(error);

    setLoaded((prev) => {
      if (!prev.data) return prev;
      const remaining = prev.data.schedules.filter(
        (s) => !(s.employeeUuid === employeeUuid && s.workDate === workDate)
      );
      return { ...prev, data: { ...prev.data, schedules: remaining } };
    });
    return { ok: true };
  }, []);

  const value = useMemo(
    () => ({
      status,
      refreshFailed,
      employees: data?.employees ?? [],
      branches: data?.branches ?? [],
      attendanceRecords: data?.attendanceRecords ?? [],
      serverOffsetMs: data?.serverOffsetMs ?? 0,
      truncated: data?.truncated ?? false,
      shiftTemplates: data?.shiftTemplates ?? [],
      rangeDays,
      setRangeDays,
      busy,
      reload,
      handleTimeIn,
      handleTimeOut,
      addEmployee,
      updateEmployee,
      setEmployeeActive,
      addBranch,
      updateBranch,
      addShiftTemplate,
      updateShiftTemplate,
      setShiftTemplateActive,
      schedules: data?.schedules ?? [], scheduleWindow: data?.scheduleWindow ?? null, 
      setSchedule, 
      clearSchedule,
    }),
    [
      status, refreshFailed, data, rangeDays, busy, reload,
      handleTimeIn, handleTimeOut, addEmployee, updateEmployee, setEmployeeActive,
      addBranch, updateBranch, addShiftTemplate, updateShiftTemplate, setShiftTemplateActive,
      setSchedule, clearSchedule,
    ]
  );

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}