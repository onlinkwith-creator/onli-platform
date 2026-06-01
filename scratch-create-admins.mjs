import { createClient } from "@supabase/supabase-js";

const supabaseUrl = "https://mhtxknpdpakjvhlhrgwq.supabase.co";
const supabaseKey = "sb_publishable_DXXJItmPtQR9M-JK62WRFA_Ty02EuCC";
const supabase = createClient(supabaseUrl, supabaseKey);

const admins = [
  { email: "onlinkwith@gmail.com", password: "onlink2001!" },
  { email: "onlinkcp@gmail.com", password: "onlink2001!" }
];

for (const admin of admins) {
  console.log(`Registering ${admin.email}...`);
  const { data, error } = await supabase.auth.signUp({
    email: admin.email,
    password: admin.password,
  });
  if (error) {
    console.error(`Failed to register ${admin.email}:`, error.message);
  } else {
    console.log(`Successfully registered/initiated ${admin.email}!`);
    console.log("User details:", data.user ? { id: data.user.id, email: data.user.email, confirmed: data.user.email_confirmed_at } : "No user returned");
  }
}
