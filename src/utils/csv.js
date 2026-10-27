import { getDateKey, getRecordStatus } from "./attendance";

const COLUMNS = [
  "Employee ID",
  "Name",
  "Branch",
  "Date",
  "Time In",
  "Time Out",
  "Hours Worked",
  "Status",
];

// Spreadsheet apps run text that starts with = + - @ as a formula. Names come
// from sign-up, so neutralize those with a leading apostrophe, then quote any
// field that contains a comma, quote, or line break.
function escapeCell(value) {
  let text = value === null || value === undefined ? "" : String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  if (/[",\r\n]/.test(text)) text = `"${text.replace(/"/g, '""')}"`;
  return text;
}

// "08:30" in 24-hour time, or "" when there is no value
function formatTime24(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

// Plain number such as "9.07", so spreadsheets can add the column up
function hoursValue(timeIn, timeOut) {
  if (!timeIn || !timeOut) return "";
  return ((new Date(timeOut) - new Date(timeIn)) / 3600000).toFixed(2);
}

export function recordsToCsv(records, employees) {
  const byId = new Map(employees.map((e) => [e.id, e]));

  const rows = records.map((record) => {
    const employee = byId.get(record.employeeId);
    return [
      record.employeeId,
      employee?.name ?? "Unknown",
      employee?.branchName ?? "",
      record.workDate ?? getDateKey(record.timeIn),
      formatTime24(record.timeIn),
      formatTime24(record.timeOut),
      hoursValue(record.timeIn, record.timeOut),
      getRecordStatus(record),
    ];
  });

  return [COLUMNS, ...rows]
    .map((row) => row.map(escapeCell).join(","))
    .join("\r\n");
}

export function downloadCsv(filename, csvText) {
  // The BOM ("\uFEFF") tells Excel the file is UTF-8
  const blob = new Blob(["\uFEFF" + csvText], {
    type: "text/csv;charset=utf-8;",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}