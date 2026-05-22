import { createClient } from "@supabase/supabase-js";
const supabase = createClient("https://mhtxknpdpakjvhlhrgwq.supabase.co", "sb_publishable_DXXJItmPtQR9M-JK62WRFA_Ty02EuCC");

// Sign in with an existing test account to verify login works
// First try to sign in with password to test login flow
const { data: signInData, error: signInErr } = await supabase.auth.signInWithPassword({
  email: "onli-flow-kim-minjun@example.invalid",
  password: "wrong_password_test",
});
console.log("Login test (wrong pw):", signInErr?.message || "unexpected success");

// Check what error code is returned
if (signInErr) {
  console.log("Error code:", signInErr.code, "Status:", signInErr.status);
}
