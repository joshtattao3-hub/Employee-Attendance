import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

// The publishable key is designed to live in browser code. Your data is
// protected by the database's row-level security rules, not by hiding it.
// NEVER put a secret or service_role key in this project.
export const isSupabaseConfigured = Boolean(url && key);

export const supabase = isSupabaseConfigured ? createClient(url, key) : null;