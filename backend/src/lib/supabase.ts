import { createClient } from "@supabase/supabase-js";
import { env } from "./env.js";

// Server-side client using the service role key. All access control is
// enforced in the route handlers / middleware, not via RLS (see schema.sql).
export const supabase = createClient(env.supabaseUrl, env.supabaseServiceRoleKey, {
  auth: { persistSession: false },
});
