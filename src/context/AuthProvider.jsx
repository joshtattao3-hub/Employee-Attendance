import { useCallback, useMemo } from "react";
import { AuthContext } from "./authContext";
import { useData } from "../hooks/useData";
import { useToast } from "../hooks/useToast";
import { useLocalStorage } from "../hooks/useLocalStorage";
import { hashPassword, createSalt } from "../utils/password";
import { createId, getNextEmployeeId } from "../utils/id";

const SESSION_KEY = "hirara:v1:session";
const isSessionValue = (v) => v === null || typeof v === "string";

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export function AuthProvider({ children }) {
  const { accounts, setAccounts, employees, setEmployees } = useData();
  const { showToast } = useToast();
  // Only the account ID is saved. Everything else is looked up fresh.
  const [sessionId, setSessionId] = useLocalStorage(
    SESSION_KEY,
    null,
    isSessionValue
  );

  // The signed-in user, or null. A deactivated employee counts as signed out.
  const currentUser = useMemo(() => {
    const account = accounts.find((a) => a.id === sessionId);
    if (!account) return null;

    if (account.role === "admin") {
      return {
        id: account.id,
        email: account.email,
        role: "admin",
        name: account.name,
        employeeId: null,
      };
    }

    const employee = employees.find((e) => e.id === account.employeeId);
    if (!employee || !employee.active) return null;

    return {
      id: account.id,
      email: account.email,
      role: "employee",
      name: employee.name,
      employeeId: employee.id,
    };
  }, [accounts, employees, sessionId]);

  const login = useCallback(
    async (email, password) => {
      await wait(500); // short pause so the loading state is visible

      const normalized = email.trim().toLowerCase();
      const account = accounts.find((a) => a.email === normalized);

      // Hash even when the email is unknown, so timing doesn't reveal it
      let hash;
      try {
        hash = await hashPassword(password, account?.salt ?? "no-account");
      } catch (error) {
        return { ok: false, error: error.message };
      }

      if (!account || hash !== account.passwordHash) {
        return { ok: false, error: "Invalid email or password." };
      }

      // Only tell someone their account is deactivated after the password matched
      let name = account.name;
      if (account.role === "employee") {
        const employee = employees.find((e) => e.id === account.employeeId);
        if (!employee || !employee.active) {
          return {
            ok: false,
            error: "This account has been deactivated. Contact your administrator.",
          };
        }
        name = employee.name;
      }

      setSessionId(account.id);
      showToast("success", `Welcome back, ${name}.`);
      return { ok: true };
    },
    [accounts, employees, setSessionId, showToast]
  );

  // Creates an employee account. If an active employee record already uses
  // this email, the account is linked to it instead of creating a duplicate.
  const signup = useCallback(
    async ({ name, email, password }) => {
      await wait(500);

      const cleanName = name.trim().replace(/\s+/g, " ");
      const normalized = email.trim().toLowerCase();

      if (accounts.some((a) => a.email === normalized)) {
        return {
          ok: false,
          field: "email",
          error: "An account with this email already exists. Try signing in.",
        };
      }

      const existing = employees.find(
        (e) => e.email?.toLowerCase() === normalized
      );

      if (existing) {
        if (!existing.active) {
          return {
            ok: false,
            field: "email",
            error: "This employee record is deactivated. Contact your administrator.",
          };
        }
        if (accounts.some((a) => a.employeeId === existing.id)) {
          return {
            ok: false,
            field: "email",
            error: "This employee already has an account. Try signing in.",
          };
        }
      }

      let salt;
      let passwordHash;
      try {
        salt = createSalt();
        passwordHash = await hashPassword(password, salt);
      } catch (error) {
        return { ok: false, error: error.message };
      }

      const employee = existing ?? {
        id: getNextEmployeeId(employees),
        name: cleanName,
        email: normalized,
        department: "Unassigned",
        position: "Team Member",
        active: true,
      };

      const account = {
        id: createId("acc"),
        email: normalized,
        name: employee.name,
        role: "employee",
        employeeId: employee.id,
        salt,
        passwordHash,
      };

      if (!existing) setEmployees((prev) => [...prev, employee]);
      setAccounts((prev) => [...prev, account]);
      setSessionId(account.id);

      showToast(
        "success",
        existing
          ? `Account linked to your employee record. Welcome, ${employee.name}.`
          : `Account created. Welcome, ${employee.name}.`
      );
      return { ok: true };
    },
    [accounts, employees, setAccounts, setEmployees, setSessionId, showToast]
  );

  const logout = useCallback(() => {
    setSessionId(null);
    showToast("success", "You have been signed out.");
  }, [setSessionId, showToast]);

  const value = useMemo(
    () => ({ currentUser, login, signup, logout }),
    [currentUser, login, signup, logout]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}