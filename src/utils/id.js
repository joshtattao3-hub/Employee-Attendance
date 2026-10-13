// Unique ID that stays unique even if records are ever removed
export function createId(prefix = "id") {
  const random =
    globalThis.crypto?.randomUUID?.() ??
    `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  return `${prefix}-${random}`;
}

// "EMP006" is the highest existing ID, so the next one is "EMP007"
export function getNextEmployeeId(employees) {
  const highest = employees.reduce((max, emp) => {
    const match = /^EMP(\d+)$/.exec(emp.id);
    return match ? Math.max(max, Number(match[1])) : max;
  }, 0);
  return `EMP${String(highest + 1).padStart(3, "0")}`;
}