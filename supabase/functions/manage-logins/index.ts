// =====================================================================
// manage-logins: lets an ADMINISTRATOR create a login for an employee or
// reset an employee's password. Runs on Supabase's servers, because these
// actions need the secret key, which must never reach the browser.
//
// Request  (POST, JSON):  { "action": "create_login",   "employee_id": "<uuid>", "role": "employee" | "manager" }
//                         { "action": "reset_password", "employee_id": "<uuid>" }
// Response (JSON):        { "ok": true, "email": "...", "employee_code": "...", "name": "...", "temp_password": "..." }
//                         or { "error": "message for the person using the app" }
//
// Safety rules:
//   * The caller's identity comes from their sign-in token, checked with
//     Supabase Auth. Nothing the browser says about itself is trusted.
//   * The caller must be an active administrator in the database.
//   * The temporary password is generated here, returned once, never stored
//     and never logged. The audit log records who did what, not the password.
// =====================================================================

import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// Newer Supabase projects store keys as JSON ({"default":"..."}); older ones
// use a plain string. Accept both.
function readKey(listVar: string, legacyVar: string): string {
  const raw = Deno.env.get(listVar);
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      if (typeof parsed === "string") return parsed;
      if (parsed && typeof parsed.default === "string") return parsed.default;
      const first = Object.values(parsed ?? {})[0];
      if (typeof first === "string") return first;
    } catch {
      return raw;
    }
  }
  return Deno.env.get(legacyVar) ?? "";
}

// Letters and digits only, with look-alikes removed (no 0/O, 1/l/I).
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";

function makeTempPassword(length = 14): string {
  // Reject bytes that would make some characters more likely than others.
  const limit = 256 - (256 % ALPHABET.length);
  let result = "";
  while (result.length < length) {
    const [byte] = crypto.getRandomValues(new Uint8Array(1));
    if (byte < limit) result += ALPHABET[byte % ALPHABET.length];
  }
  // The app requires at least one letter and one number.
  return /[A-Za-z]/.test(result) && /\d/.test(result) ? result : makeTempPassword(length);
}

// deno-lint-ignore no-explicit-any
type Admin = any;

async function writeAudit(
  admin: Admin,
  callerId: string,
  action: string,
  profileId: string,
  details: Record<string, unknown>,
) {
  const { error } = await admin.from("audit_log").insert({
    actor_id: callerId,
    action,
    table_name: "profiles",
    record_id: profileId,
    new_data: details, // never includes the password
  });
  if (error) console.error("Could not write the audit log entry:", error.message);
}

async function createLogin(admin: Admin, callerId: string, employeeId: string, role: string) {
  if (role !== "employee" && role !== "manager") {
    return json({ error: "Choose employee or manager." }, 400);
  }

  const { data: employee } = await admin
    .from("employees")
    .select("id, employee_code, full_name, email, active")
    .eq("id", employeeId)
    .maybeSingle();
  if (!employee) return json({ error: "Employee not found." }, 404);
  if (!employee.active) {
    return json({ error: "This employee is deactivated. Reactivate them first." }, 409);
  }

  const { data: existing } = await admin
    .from("profiles")
    .select("id")
    .eq("employee_id", employee.id)
    .maybeSingle();
  if (existing) {
    return json({ error: "This employee already has a login. Use Reset password instead." }, 409);
  }

  const password = makeTempPassword();
  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email: employee.email,
    password,
    email_confirm: true, // no confirmation email is needed for admin-created logins
  });
  if (createError || !created?.user) {
    const taken = /already|registered|exists/i.test(createError?.message ?? "");
    return json(
      { error: taken ? "A login with this email already exists." : "Could not create the login." },
      taken ? 409 : 500,
    );
  }

  // A database trigger has already linked the new login to this employee
  // (matched by email). Now set the role and require a password change.
  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .update({ role, must_change_password: true })
    .eq("id", created.user.id)
    .select("id")
    .maybeSingle();
  if (profileError || !profile) {
    await admin.auth.admin.deleteUser(created.user.id); // never leave a login without access
    return json({ error: "Could not finish setting up the login. Nothing was created." }, 500);
  }

  await writeAudit(admin, callerId, "CREATE_LOGIN", profile.id, {
    employee_code: employee.employee_code,
    email: employee.email,
    role,
  });

  return json({
    ok: true,
    email: employee.email,
    employee_code: employee.employee_code,
    name: employee.full_name,
    temp_password: password,
  });
}

async function resetPassword(admin: Admin, callerId: string, employeeId: string) {
  const { data: profile } = await admin
    .from("profiles")
    .select("id, active, employee:employees(employee_code, full_name, email)")
    .eq("employee_id", employeeId)
    .maybeSingle();
  if (!profile) return json({ error: "This employee doesn't have a login yet." }, 404);
  if (!profile.active) return json({ error: "This login is switched off." }, 409);

  const employee = Array.isArray(profile.employee) ? profile.employee[0] : profile.employee;
  const password = makeTempPassword();

  const { error: updateError } = await admin.auth.admin.updateUserById(profile.id, { password });
  if (updateError) return json({ error: "Could not reset the password." }, 500);

  const { error: flagError } = await admin
    .from("profiles")
    .update({ must_change_password: true })
    .eq("id", profile.id);
  if (flagError) console.error("Could not set must_change_password:", flagError.message);

  await writeAudit(admin, callerId, "RESET_PASSWORD", profile.id, {
    employee_code: employee?.employee_code,
    email: employee?.email,
  });

  return json({
    ok: true,
    email: employee?.email,
    employee_code: employee?.employee_code,
    name: employee?.full_name,
    temp_password: password,
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed." }, 405);

  const url = Deno.env.get("SUPABASE_URL") ?? "";
  const secretKey = readKey("SUPABASE_SECRET_KEYS", "SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !secretKey) return json({ error: "The server is not configured." }, 500);

  const admin = createClient(url, secretKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // 1. Who is calling? (verified by Supabase Auth, not taken on trust)
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!token) return json({ error: "Sign in first." }, 401);

  const { data: userData, error: userError } = await admin.auth.getUser(token);
  if (userError || !userData?.user) {
    return json({ error: "Your session has expired. Sign in again." }, 401);
  }
  const caller = userData.user;

  // 2. Are they an active administrator?
  const { data: callerProfile } = await admin
    .from("profiles")
    .select("role, active")
    .eq("id", caller.id)
    .maybeSingle();
  if (!callerProfile || !callerProfile.active || callerProfile.role !== "admin") {
    return json({ error: "Only administrators can do this." }, 403);
  }

  // 3. What did they ask for?
  let body: { action?: unknown; employee_id?: unknown; role?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid request." }, 400);
  }
  const employeeId = typeof body.employee_id === "string" ? body.employee_id : "";
  if (!UUID.test(employeeId)) return json({ error: "Invalid employee." }, 400);

  if (body.action === "create_login") {
    return await createLogin(admin, caller.id, employeeId, String(body.role ?? "employee"));
  }
  if (body.action === "reset_password") {
    return await resetPassword(admin, caller.id, employeeId);
  }
  return json({ error: "Unknown action." }, 400);
});