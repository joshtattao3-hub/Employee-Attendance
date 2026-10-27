import {
  DashboardIcon,
  UsersIcon,
  RecordsIcon,
  SettingsIcon,
  BranchIcon,
  ClockIcon,
  CalendarIcon
} from "../components/Icons";

const ADMIN_NAV = [
  { id: "dashboard", label: "Dashboard", icon: DashboardIcon },
  { id: "employees", label: "Employees", icon: UsersIcon },
  { id: "records", label: "Attendance Records", icon: RecordsIcon },
  { id: "settings", label: "Settings", icon: SettingsIcon },
  { id: "branches", label: "Branches", icon: BranchIcon },
];

const EMPLOYEE_NAV = [
  { id: "my-dashboard", label: "My Dashboard", icon: DashboardIcon },
  { id: "my-attendance", label: "My Attendance", icon: RecordsIcon },
];

const MANAGER_NAV = [
  { id: "my-dashboard", label: "My Dashboard", icon: ClockIcon },
  { id: "my-attendance", label: "My Attendance", icon: CalendarIcon },
  { id: "dashboard", label: "Team Dashboard", icon: DashboardIcon },
  { id: "records", label: "Team Attendance", icon: RecordsIcon },
  { id: "employees", label: "Team", icon: UsersIcon },
];

export function getNavItems(role) {
  if (role === "admin") return ADMIN_NAV;
  if (role === "manager") return MANAGER_NAV;
  return EMPLOYEE_NAV;
}