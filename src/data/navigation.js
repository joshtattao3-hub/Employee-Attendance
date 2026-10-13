import {
  DashboardIcon,
  UsersIcon,
  RecordsIcon,
  SettingsIcon,
} from "../components/Icons";

const ADMIN_NAV = [
  { id: "dashboard", label: "Dashboard", icon: DashboardIcon },
  { id: "employees", label: "Employees", icon: UsersIcon },
  { id: "records", label: "Attendance Records", icon: RecordsIcon },
  { id: "settings", label: "Settings", icon: SettingsIcon },
];

const EMPLOYEE_NAV = [
  { id: "my-dashboard", label: "My Dashboard", icon: DashboardIcon },
  { id: "my-attendance", label: "My Attendance", icon: RecordsIcon },
];

// Anything that isn't exactly "admin" gets the smaller menu
export function getNavItems(role) {
  return role === "admin" ? ADMIN_NAV : EMPLOYEE_NAV;
}