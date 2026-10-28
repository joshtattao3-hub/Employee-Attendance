import { useState, useEffect } from "react";
import { useData } from "./hooks/useData";
import { useAuth } from "./hooks/useAuth";
import { getNavItems } from "./data/navigation";
import Sidebar from "./components/layout/Sidebar";
import Topbar from "./components/layout/Topbar";
import StatusScreen from "./components/StatusScreen";
import AuthPage from "./pages/AuthPage";
import ChangePasswordPage from "./pages/ChangePasswordPage";
import DashboardPage from "./pages/DashboardPage";
import EmployeesPage from "./pages/EmployeesPage";
import RecordsPage from "./pages/RecordsPage";
import SettingsPage from "./pages/SettingsPage";
import MyDashboardPage from "./pages/MyDashboardPage";
import MyAttendancePage from "./pages/MyAttendancePage";
import BranchesPage from "./pages/BranchesPage";
import ShiftTemplatesPage from "./pages/ShiftTemplatesPage";
import SchedulePage from "./pages/SchedulePage";
import MySchedulePage from "./pages/MySchedulePage";

function AppShell() {
  const { currentUser } = useAuth();
  const { attendanceRecords, refreshFailed, reload } = useData();

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
          {refreshFailed && (
            <div className="alert alert--warning" role="status">
              <span>
                We couldn’t refresh your data, so you’re seeing the last version
                we loaded.{" "}
                <button type="button" className="link-btn" onClick={reload}>
                  Try again
                </button>
              </span>
            </div>
          )}

          {activePage === "dashboard" && (
            <DashboardPage records={attendanceRecords} onNavigate={navigate} />
          )}
          {activePage === "employees" && (
            <EmployeesPage 
            records={attendanceRecords}
            readOnly={currentUser.role !== "admin"} 
            />
          )}
          {activePage === "branches" && (
            <BranchesPage />
          )}
          {activePage === "shifts" && (
            <ShiftTemplatesPage readOnly={currentUser.role !== "admin"} />
          )}
          {activePage === "records" && (
            <RecordsPage records={attendanceRecords} />
          )}
          {activePage === "settings" && <SettingsPage />}

          {activePage === "my-dashboard" && (
            <MyDashboardPage onNavigate={navigate} />
          )}
          {activePage === "my-attendance" && <MyAttendancePage />}
          {activePage === "schedule" && <SchedulePage />}
          {activePage === "my-schedule" && <MySchedulePage />}
        </main>
      </div>
    </div>
  );
}

// Shows a loading or error screen until the attendance data is ready
function DataGate({ children }) {
  const { status, reload } = useData();
  const { logout } = useAuth();

  if (status === "loading") {
    return <StatusScreen busy title="Loading attendance data…" />;
  }

  if (status === "error") {
    return (
      <StatusScreen
        title="We couldn’t load your data"
        text="Check your connection and try again."
      >
        <div className="status-screen__actions">
          <button type="button" className="btn-primary" onClick={reload}>
            Try again
          </button>
          <button type="button" className="btn-secondary" onClick={logout}>
            Sign out
          </button>
        </div>
      </StatusScreen>
    );
  }

  return children;
}

function App() {
  const { currentUser, loading, loadFailed, notConfigured, reload, logout } = useAuth();

  if (notConfigured) {
    return (
      <StatusScreen
        title="Not connected to a database"
        text="Add VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY to a .env.local file (or to your hosting settings), then restart the app."
      />
    );
  }

  if (loading) return <StatusScreen busy title="Loading your workspace…" />;

  if (loadFailed) {
    return (
      <StatusScreen
        title="We couldn’t load your account"
        text="Check your connection and try again."
      >
        <div className="status-screen__actions">
          <button type="button" className="btn-primary" onClick={reload}>
            Try again
          </button>
          <button type="button" className="btn-secondary" onClick={logout}>
            Sign out
          </button>
        </div>
      </StatusScreen>
    );
  }

  if (!currentUser) return <AuthPage />;
  if (currentUser.mustChangePassword) return <ChangePasswordPage />;
  return (
    <DataGate>
      <AppShell />
    </DataGate>
  );
}

export default App;