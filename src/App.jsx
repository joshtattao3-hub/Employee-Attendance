import { useState, useEffect } from "react";
import { useData } from "./hooks/useData";
import { useAuth } from "./hooks/useAuth";
import { getNavItems } from "./data/navigation";
import Sidebar from "./components/layout/Sidebar";
import Topbar from "./components/layout/Topbar";
import AuthPage from "./pages/AuthPage";
import DashboardPage from "./pages/DashboardPage";
import EmployeesPage from "./pages/EmployeesPage";
import RecordsPage from "./pages/RecordsPage";
import SettingsPage from "./pages/SettingsPage";
import MyDashboardPage from "./pages/MyDashboardPage";
import MyAttendancePage from "./pages/MyAttendancePage";

function AppShell() {
  const { currentUser } = useAuth();
  const { attendanceRecords } = useData();

  const navItems = getNavItems(currentUser.role);
  const [requestedPage, setActivePage] = useState(navItems[0].id);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Route guard: a page this role can't see falls back to the role's home page
  const activePage = navItems.some((item) => item.id === requestedPage)
    ? requestedPage
    : navItems[0].id;
  const title = navItems.find((item) => item.id === activePage).label;

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
            <DashboardPage records={attendanceRecords} onNavigate={navigate} />
          )}
          {activePage === "employees" && (
            <EmployeesPage records={attendanceRecords} />
          )}
          {activePage === "records" && (
            <RecordsPage records={attendanceRecords} />
          )}
          {activePage === "settings" && <SettingsPage />}

          {activePage === "my-dashboard" && (
            <MyDashboardPage onNavigate={navigate} />
          )}
          {activePage === "my-attendance" && <MyAttendancePage />}
        </main>
      </div>
    </div>
  );
}

function App() {
  const { currentUser } = useAuth();
  return currentUser ? <AppShell /> : <AuthPage />;
}

export default App;