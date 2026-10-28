// Shift times travel as "HH:MM" text (for example "08:00").

export function toMinutes(hhmm) {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

// "13:30" -> "1:30 PM"
export function formatShiftTime(hhmm) {
  const total = toMinutes(hhmm);
  const hours = Math.floor(total / 60);
  const minutes = total % 60;
  const period = hours >= 12 ? "PM" : "AM";
  return `${hours % 12 || 12}:${String(minutes).padStart(2, "0")} ${period}`;
}

// Length of a shift in minutes. An end at or before the start means it
// runs past midnight, so a day is added.
export function shiftMinutes(start, end) {
  let diff = toMinutes(end) - toMinutes(start);
  if (diff <= 0) diff += 24 * 60;
  return diff;
}

// Hours actually worked: shift length minus the unpaid break
export function formatPaidHours(start, end, breakMinutes) {
  const minutes = Math.max(0, shiftMinutes(start, end) - breakMinutes);
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours} h ${rest} min` : `${hours} h`;
}

// ---- calendar days as "YYYY-MM-DD" text (no time zones involved) ----

export function dateKey(date) {
  return date.toISOString().slice(0, 10);
}

export function addDays(key, days) {
  const d = new Date(`${key}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// The Monday of the week that contains this day
export function weekStartOf(key) {
  const day = new Date(`${key}T00:00:00Z`).getUTCDay(); // 0 = Sunday
  return addDays(key, -((day + 6) % 7));
}

// Today's calendar day in a given time zone, at a given moment
export function todayInZone(nowMs, timeZone) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(nowMs)); // en-CA writes YYYY-MM-DD
}

// "2026-11-04" -> "Wed, Nov 4"
export function formatDay(key, options = { weekday: "short", month: "short", day: "numeric" }) {
  return new Intl.DateTimeFormat("en-US", { ...options, timeZone: "UTC" }).format(
    new Date(`${key}T00:00:00Z`)
  );
}

// A real moment shown as clock time in the branch's time zone: "8:00 AM"
export function formatClock(iso, timeZone) {
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone,
  }).format(new Date(iso));
}

// 510 -> "8 h 30 min"
export function formatDuration(minutes) {
  const total = Math.max(0, Math.round(minutes));
  const hours = Math.floor(total / 60);
  const rest = total % 60;
  if (hours === 0) return `${rest} min`;
  return rest ? `${hours} h ${rest} min` : `${hours} h`;
}