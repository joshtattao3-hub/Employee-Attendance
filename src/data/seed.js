export const seedEmployees = [
  { id: "EMP001", name: "Maria Santos", email: "maria@hirara.demo", department: "Engineering", position: "Software Engineer", active: true },
  { id: "EMP002", name: "John Reyes", email: "john@hirara.demo", department: "Operations", position: "Operations Lead", active: true },
  { id: "EMP003", name: "Angela Cruz", email: "angela@hirara.demo", department: "Finance", position: "Accountant", active: true },
  { id: "EMP004", name: "Mark Dela Cruz", email: "mark@hirara.demo", department: "Sales", position: "Sales Associate", active: true },
  { id: "EMP005", name: "Sofia Garcia", email: "sofia@hirara.demo", department: "Human Resources", position: "HR Specialist", active: true },
  { id: "EMP006", name: "Daniel Lim", email: "daniel@hirara.demo", department: "Engineering", position: "QA Analyst", active: true },
];

// A local-time timestamp N days ago, as an ISO string
function atDaysAgo(daysAgo, hour, minute) {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  d.setHours(hour, minute, 0, 0);
  return d.toISOString();
}

// Three days of history. Oldest day first, because the app assumes
// records are stored in time order.
export function createSeedRecords() {
  const records = [];
  let n = 1;

  for (let daysAgo = 3; daysAgo >= 1; daysAgo--) {
    seedEmployees.forEach((emp, i) => {
      // Daniel was absent two days ago
      if (emp.id === "EMP006" && daysAgo === 2) return;

      // John forgot to clock out yesterday
      const missedTimeOut = emp.id === "EMP002" && daysAgo === 1;

      records.push({
        id: `seed-${n++}`,
        employeeId: emp.id,
        timeIn: atDaysAgo(daysAgo, 8, (i * 7) % 40),
        timeOut: missedTimeOut ? null : atDaysAgo(daysAgo, 17, (i * 11) % 50),
      });
    });
  }

  return records;
}