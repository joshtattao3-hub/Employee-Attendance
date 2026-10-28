import { useEffect, useMemo, useState } from "react";
import { useData } from "../hooks/useData";
import { useToast } from "../hooks/useToast";
import Avatar from "../components/Avatar";
import SearchBar from "../components/SearchBar";
import { AlertCircleIcon, CalendarIcon, SearchIcon } from "../components/Icons";
import {
  addDays,
  formatClock,
  formatDay,
  formatDuration,
  formatShiftTime,
  todayInZone,
  weekStartOf,
} from "../utils/shifts";

const CUSTOM = "__custom";

function SchedulePage() {
  const {
    employees,
    branches,
    shiftTemplates,
    schedules,
    scheduleWindow,
    serverOffsetMs,
    setSchedule,
    clearSchedule,
  } = useData();
  const { showToast } = useToast();

  const [searchTerm, setSearchTerm] = useState("");
  const [branchChoice, setBranchChoice] = useState("");
  const [weekChoice, setWeekChoice] = useState(null); // null = this week
  const [savingKey, setSavingKey] = useState(null);

  // "Now" by the database clock, refreshed every minute
  const [tick, setTick] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setTick(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);
  const nowMs = tick + serverOffsetMs;

  // Branches that have someone to schedule. A manager only ever sees one.
  const branchOptions = useMemo(
    () =>
      branches.filter((b) =>
        employees.some((e) => e.branchId === b.id && e.active !== false)
      ),
    [branches, employees]
  );
  const branch = branchOptions.find((b) => b.id === branchChoice) ?? branchOptions[0] ?? null;
  const timeZone = branch?.timezone ?? "UTC";

  // ---- which week is showing ----
  const today = todayInZone(nowMs, timeZone);
  const firstWeek =
    weekStartOf(scheduleWindow.from) < scheduleWindow.from
      ? addDays(weekStartOf(scheduleWindow.from), 7)
      : weekStartOf(scheduleWindow.from);
  const lastWeek = weekStartOf(addDays(scheduleWindow.to, -6));
  const clampWeek = (w) => (w < firstWeek ? firstWeek : w > lastWeek ? lastWeek : w);
  const weekStart = clampWeek(weekChoice ?? weekStartOf(today));
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const thisWeek = clampWeek(weekStartOf(today));

  // ---- data for the grid ----
  const byKey = useMemo(() => {
    const map = new Map();
    for (const s of schedules) {
      const key = `${s.employeeUuid}|${s.workDate}`;
      if (!map.has(key)) map.set(key, s); // first shift of the day
    }
    return map;
  }, [schedules]);

  const templateById = useMemo(
    () => new Map(shiftTemplates.map((t) => [t.id, t])),
    [shiftTemplates]
  );
  // Overnight shifts can't be scheduled yet
  const choices = shiftTemplates.filter((t) => t.active && !t.crossesMidnight);

  const query = searchTerm.trim().toLowerCase();
  const rows = employees.filter((emp) => {
    if (!branch || emp.branchId !== branch.id || emp.active === false) return false;
    return [emp.name, emp.id].some((f) => f?.toLowerCase().includes(query));
  });

  function weekMinutes(emp) {
    let minutes = 0;
    for (const day of days) {
      const s = byKey.get(`${emp.uuid}|${day}`);
      if (s) {
        minutes +=
          (Date.parse(s.endAt) - Date.parse(s.startAt)) / 60000 - (s.breakMinutes ?? 0);
      }
    }
    return minutes;
  }

  async function handleChange(emp, day, templateId) {
    if (savingKey) return;
    setSavingKey(`${emp.uuid}|${day}`);
    const result =
      templateId === ""
        ? await clearSchedule(emp.uuid, day)
        : await setSchedule(emp.uuid, day, templateId);
    setSavingKey(null);

    if (!result.ok) {
      showToast("error", result.error);
      return;
    }
    const when = formatDay(day);
    showToast(
      "success",
      templateId === ""
        ? `${emp.name} is off on ${when}.`
        : `${emp.name} is set to ${templateById.get(templateId)?.name ?? "a shift"} on ${when}.`
    );
  }

  function renderCell(emp, day) {
    const key = `${emp.uuid}|${day}`;
    const sched = byKey.get(key);
    const template = sched ? templateById.get(sched.templateId) : null;
    const times = sched
      ? `${formatClock(sched.startAt, timeZone)} – ${formatClock(sched.endAt, timeZone)}`
      : null;

    // Days before today are history: show them, don't edit them
    if (day < today) {
      return sched ? (
        <>
          <span>{template?.name ?? "Shift"}</span>
          <span className="schedule-cell__time">{times}</span>
        </>
      ) : (
        <span className="cell-muted">—</span>
      );
    }

    const value = sched ? (sched.templateId ?? CUSTOM) : "";
    // Keep the current shift selectable even if its template was switched off
    const showCurrent = sched && !choices.some((t) => t.id === sched.templateId);

    return (
      <>
        <select
          className="field__control"
          value={value}
          onChange={(e) => handleChange(emp, day, e.target.value)}
          disabled={savingKey !== null}
          aria-label={`Shift for ${emp.name} on ${formatDay(day)}`}
        >
          <option value="">Day off</option>
          {showCurrent &&
            (sched.templateId ? (
              <option value={sched.templateId}>
                {template?.name ?? "Shift"} (switched off)
              </option>
            ) : (
              <option value={CUSTOM} disabled>
                Custom shift
              </option>
            ))}
          {choices.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name} · {formatShiftTime(t.startTime)}–{formatShiftTime(t.endTime)}
            </option>
          ))}
        </select>
        {times && <span className="schedule-cell__time">{times}</span>}
      </>
    );
  }

  if (!branch) {
    return (
      <section className="card panel">
        <div className="empty-state">
          <span className="empty-state__icon">
            <CalendarIcon size={22} />
          </span>
          <h3 className="empty-state__title">Nobody to schedule yet</h3>
          <p className="empty-state__text">
            Active employees will appear here once they’re added to a branch.
          </p>
        </div>
      </section>
    );
  }

  const weekLabel = `${formatDay(weekStart, { month: "short", day: "numeric" })} – ${formatDay(
    addDays(weekStart, 6),
    { month: "short", day: "numeric" }
  )}, ${addDays(weekStart, 6).slice(0, 4)}`;

  return (
    <section className="card panel">
      <div className="panel__header">
        <div>
          <h2 className="panel__title">Weekly schedule</h2>
          <p className="panel__subtitle">
            {weekLabel} · {branch.name} · {rows.length}{" "}
            {rows.length === 1 ? "employee" : "employees"}
          </p>
        </div>
        <div className="row-actions">
          <button
            type="button"
            className="btn-secondary"
            onClick={() => setWeekChoice(clampWeek(addDays(weekStart, -7)))}
            disabled={weekStart <= firstWeek}
          >
            Previous week
          </button>
          <button
            type="button"
            className="btn-secondary"
            onClick={() => setWeekChoice(null)}
            disabled={weekStart === thisWeek}
          >
            This week
          </button>
          <button
            type="button"
            className="btn-secondary"
            onClick={() => setWeekChoice(clampWeek(addDays(weekStart, 7)))}
            disabled={weekStart >= lastWeek}
          >
            Next week
          </button>
        </div>
      </div>

      {choices.length === 0 && (
        <div className="alert alert--warning" role="status">
          <AlertCircleIcon size={18} />
          <span>
            There are no active shift templates, so shifts can’t be assigned.
            An administrator can add one under Shift Templates.
          </span>
        </div>
      )}

      <div className="toolbar">
        <SearchBar value={searchTerm} onChange={setSearchTerm} />
        {branchOptions.length > 1 && (
          <label className="field">
            <span className="field__label">Branch</span>
            <select
              className="field__control"
              value={branch.id}
              onChange={(e) => setBranchChoice(e.target.value)}
            >
              {branchOptions.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </label>
        )}
        {query !== "" && (
          <button type="button" className="btn-secondary" onClick={() => setSearchTerm("")}>
            Clear search
          </button>
        )}
      </div>

      {rows.length === 0 ? (
        <div className="empty-state">
          <span className="empty-state__icon">
            <SearchIcon size={22} />
          </span>
          <h3 className="empty-state__title">No employees found</h3>
          <p className="empty-state__text">Nothing matches your search.</p>
          <button type="button" className="btn-secondary" onClick={() => setSearchTerm("")}>
            Clear search
          </button>
        </div>
      ) : (
        <div className="table-wrapper">
          <table className="data-table schedule-grid">
            <thead>
              <tr>
                <th>Employee</th>
                {days.map((day) => (
                  <th key={day} className={day === today ? "schedule-day--today" : ""}>
                    {formatDay(day)}
                    {day === today && " (today)"}
                  </th>
                ))}
                <th>Paid hours</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((emp) => (
                <tr key={emp.uuid}>
                  <td>
                    <div className="employee-cell">
                      <Avatar name={emp.name} />
                      <div className="employee-cell__text">
                        <span className="employee-cell__name">{emp.name}</span>
                        <span className="employee-cell__sub">{emp.id}</span>
                      </div>
                    </div>
                  </td>
                  {days.map((day) => (
                    <td key={day}>{renderCell(emp, day)}</td>
                  ))}
                  <td>{formatDuration(weekMinutes(emp))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

export default SchedulePage;