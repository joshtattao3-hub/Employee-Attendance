import { useState } from "react";
import { useData } from "../hooks/useData";
import LiveClock from "../components/LiveClock";
import SummaryCards from "../components/SummaryCards";
import EmployeeList from "../components/EmployeeList";
import RecentActivity from "../components/RecentActivity";

// Admin overview. Read-only: employees clock themselves in and out.
function DashboardPage({ records, onNavigate }) {
  const { employees } = useData();
  const [searchTerm, setSearchTerm] = useState("");

  // Deactivated employees don't appear in today's attendance
  const activeEmployees = employees.filter((emp) => emp.active !== false);

  // Build a filtered copy for display. The original arrays are untouched.
  const query = searchTerm.trim().toLowerCase();
  const filteredEmployees = activeEmployees.filter(
    (emp) =>
      emp.name.toLowerCase().includes(query) ||
      emp.id.toLowerCase().includes(query)
  );

  return (
    <>
      <LiveClock />
      <SummaryCards employees={employees} records={records} />
      <EmployeeList
        employees={filteredEmployees}
        records={records}
        totalCount={activeEmployees.length}
        searchTerm={searchTerm}
        onSearchChange={setSearchTerm}
      />
      <RecentActivity
        records={records}
        onViewAll={() => onNavigate("records")}
      />
    </>
  );
}

export default DashboardPage;