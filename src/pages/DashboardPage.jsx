import { useState } from "react";
import { employees } from "../data/employees";
import LiveClock from "../components/LiveClock";
import SummaryCards from "../components/SummaryCards";
import EmployeeList from "../components/EmployeeList";
import RecentActivity from "../components/RecentActivity";

function DashboardPage({ records, onTimeIn, onTimeOut, onNavigate }) {
  const [searchTerm, setSearchTerm] = useState("");

  // Build a filtered copy for display. The original employees array is untouched.
  const query = searchTerm.trim().toLowerCase();
  const filteredEmployees = employees.filter(
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
        totalCount={employees.length}
        searchTerm={searchTerm}
        onSearchChange={setSearchTerm}
        onTimeIn={onTimeIn}
        onTimeOut={onTimeOut}
      />
      <RecentActivity
        records={records}
        onViewAll={() => onNavigate("records")}
      />
    </>
  );
}

export default DashboardPage;