import { useState, useEffect } from "react";
import { useAttendance } from "./hooks/useAttendance";
import { NAV_ITEMS } from "./data/navigation";
import Sidebar from "./components/layout/Sidebar";
import Topbar from "./components/layout/Topbar";
import DashboardPage from "./pages/DashboardPage";
import Toast from "./components/Toast";
import RecordsPage from "./pages/RecordsPage";
import EmployeesPage from "./pages/EmployeesPage";
import SettingsPage from "./pages/SettingsPage";

function App() {
  const { attendanceRecords, message, clearMessage, handleTimeIn, handleTimeOut } =
    useAttendance();
  const [activePage, setActivePage] = useState("dashboard");
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Close the mobile drawer when Escape is pressed
  useEffect(() => {
    if (!sidebarOpen) return;
    const onKeyDown = (e) => {
      if (e.key === "Escape") setSidebarOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [sidebarOpen]);

  function navigate(pageId) {
    setActivePage(pageId);
    setSidebarOpen(false);
  }

  const title = NAV_ITEMS.find((item) => item.id === activePage).label;

  return (
    <div className="shell">
      <a href="#main-content" className="skip-link">
        Skip to main content
      </a>
      <Sidebar
        activePage={activePage}
        onNavigate={navigate}
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />
      <div
        className={`overlay ${sidebarOpen ? "overlay--visible" : ""}`}
        onClick={() => setSidebarOpen(false)}
        aria-hidden="true"
      />

      <div className="main">
        <Topbar title={title} onMenuClick={() => setSidebarOpen(true)} />

        <main id="main-content" tabIndex={-1} className="content">

          {activePage === "dashboard" && (
            <DashboardPage
              records={attendanceRecords}
              onTimeIn={handleTimeIn}
              onTimeOut={handleTimeOut}
              onNavigate={navigate}
            />
          )}

          {activePage === "records" && (
            <RecordsPage records={attendanceRecords} />
          )}

          {/* TEMPORARY placeholder until these pages are built */}
          {activePage === "employees" && (
            <EmployeesPage records={attendanceRecords} />
          )}

          {activePage === "settings" && <SettingsPage />}
        </main>
         <Toast message={message} onDismiss={clearMessage} />
      </div>
    </div>
  );
}

export default App;