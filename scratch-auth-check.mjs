import { createClient } from "@supabase/supabase-js";

const { VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, ONLI_TEST_EMAIL, ONLI_TEST_PASSWORD } = process.env;
if (!VITE_SUPABASE_URL || !VITE_SUPABASE_ANON_KEY || !ONLI_TEST_EMAIL || !ONLI_TEST_PASSWORD) {
  throw new Error("Provide Supabase and test account environment variables.");
}
const client = createClient(VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const { error } = await client.auth.signInWithPassword({ email: ONLI_TEST_EMAIL, password: ONLI_TEST_PASSWORD });
console.log(error ? { ok: false, code: error.code } : { ok: true });
if (!error) await client.auth.signOut({ scope: "local" });
process.exitCode = error ? 1 : 0;
