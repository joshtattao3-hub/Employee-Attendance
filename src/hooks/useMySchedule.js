import { useEffect, useMemo, useState } from "react";
import { useAuth } from "./useAuth";
import { useData } from "./useData";
import { todayInZone } from "../utils/shifts";

// The signed-in person's own shifts, and what "today" means at their branch.
export function useMySchedule() {
  const { currentUser } = useAuth();
  const { employees, branches, shiftTemplates, schedules, serverOffsetMs } = useData();

  // Re-check "today" every minute (the day can change while the page is open)
  const [tick, setTick] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setTick(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  const employee = employees.find((e) => e.id === currentUser.employeeId) ?? null;
  const branch = employee ? branches.find((b) => b.id === employee.branchId) : null;
  const timeZone = branch?.timezone ?? "UTC";
  // Counted by the database clock, on the branch's calendar
  const today = todayInZone(tick + serverOffsetMs, timeZone);

  const mine = useMemo(() => {
    if (!employee) return [];
    return schedules
      .filter((s) => s.employeeUuid === employee.uuid)
      .sort((a, b) => Date.parse(a.startAt) - Date.parse(b.startAt));
  }, [schedules, employee]);

  const upcoming = mine.filter((s) => s.workDate >= today);
  const todayShift = upcoming.find((s) => s.workDate === today) ?? null;

  const templateNames = useMemo(
    () => new Map(shiftTemplates.map((t) => [t.id, t.name])),
    [shiftTemplates]
  );
  const shiftName = (schedule) => templateNames.get(schedule.templateId) ?? "Shift";

  return { employee, timeZone, today, mine, upcoming, todayShift, shiftName };
}