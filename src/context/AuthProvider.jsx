import { useCallback, useEffect, useMemo, useState } from "react";
import { AuthContext } from "./authContext";
import { useToast } from "../hooks/useToast";
import { supabase, isSupabaseConfigured } from "../lib/supabase";

const PROFILE_COLUMNS =
  "id, email, role, active, must_change_password, " +
  "employee:employees(id, employee_code, full_name, branch_id, job_title, active)";

function friendlySignInError(error) {
  if (error.status === 429 || error.code === "over_request_rate_limit") {
    return "Too many attempts. Wait a few minutes and try again.";
  }
  if (error.code === "invalid_credentials") {
    return "Invalid email or password.";
  }
  return "We couldn’t sign you in. Check your connection and try again.";
}

function friendlyPasswordError(error) {
  if (error.code === "same_password") {
    return "Choose a password that is different from your current one.";
  }
  if (error.code === "weak_password") {
    return "That password is too weak. Use at least 8 characters with a letter and a number.";
  }
  return "We couldn’t change your password. Check your connection and try again.";
}

export function AuthProvider({ children }) {
  const { showToast } = useToast();

  const [session, setSession] = useState(null);
  const [sessionReady, setSessionReady] = useState(!isSupabaseConfigured);
  // The loaded profile belongs to one user. If the signed-in user changes,
  // the old profile no longer matches and we treat the app as loading.
  const [loaded, setLoaded] = useState({ userId: null, profile: null, failed: false });
  const [reloadKey, setReloadKey] = useState(0);
  const [notice, setNotice] = useState("");

  // 1. Keep track of the Supabase session (restored automatically after a refresh).
  useEffect(() => {
    if (!supabase) return;
    let active = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setSession(data.session);
      setSessionReady(true);
    });

    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setSessionReady(true);
    });

    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, []);

  const userId = session?.user?.id ?? null;

  // 2. Load who this person is (role, employee record). Row-level security
  //    returns nothing for anyone who is deactivated or has no profile.
  useEffect(() => {
    if (!supabase || !userId) return;
    let cancelled = false;

    (async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select(PROFILE_COLUMNS)
        .eq("id", userId)
        .maybeSingle();
      if (cancelled) return;

      if (error) {
        setLoaded({ userId, profile: null, failed: true });
        return;
      }

      const hasAccess = data && (data.role === "admin" || data.employee);
      if (!hasAccess) {
        setNotice("This account doesn’t have access. Contact your administrator.");
        await supabase.auth.signOut();
        return;
      }

      setLoaded({ userId, profile: data, failed: false });
    })();

    return () => {
      cancelled = true;
    };
  }, [userId, reloadKey]);

  const loading = !sessionReady || (userId !== null && loaded.userId !== userId);
  const loadFailed = userId !== null && loaded.userId === userId && loaded.failed;

  const currentUser = useMemo(() => {
    if (!userId || loaded.userId !== userId || !loaded.profile) return null;
    const { profile } = loaded;
    const employee = profile.employee;
    return {
      id: profile.id,
      email: profile.email,
      role: profile.role,
      name: employee?.full_name ?? "Administrator",
      // The screens still use demo data keyed by employee code (EMP001...)
      // until the data moves to the database in the next stage.
      employeeId: employee?.employee_code ?? null,
      employeeUuid: employee?.id ?? null,
      branchId: employee?.branch_id ?? null,
      mustChangePassword: profile.must_change_password,
    };
  }, [userId, loaded]);

  const login = useCallback(async (email, password) => {
    if (!supabase) {
      return { ok: false, error: "The app isn’t connected to its database yet." };
    }
    setNotice("");
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    });
    if (error) return { ok: false, error: friendlySignInError(error) };
    return { ok: true };
  }, []);

  const logout = useCallback(async () => {
    if (!supabase) return;
    await supabase.auth.signOut();
    showToast("success", "You have been signed out.");
  }, [showToast]);

  // Used on the forced "choose a new password" screen.
  const changePassword = useCallback(async (newPassword) => {
    if (!supabase) return { ok: false, error: "The app isn’t connected to its database yet." };

    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) return { ok: false, error: friendlyPasswordError(error) };

    const { error: flagError } = await supabase.rpc("finish_password_change");
    if (flagError) {
      return {
        ok: false,
        error: "Your password was changed, but setup didn’t finish. Sign out and sign in with your new password.",
      };
    }

    setReloadKey((key) => key + 1);
    return { ok: true };
  }, []);

  const reload = useCallback(() => {
    setLoaded({ userId: null, profile: null, failed: false });
    setReloadKey((key) => key + 1);
  }, []);

  const value = useMemo(
    () => ({
      currentUser,
      loading,
      loadFailed,
      notConfigured: !isSupabaseConfigured,
      authNotice: notice,
      login,
      logout,
      changePassword,
      reload,
    }),
    [currentUser, loading, loadFailed, notice, login, logout, changePassword, reload]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}