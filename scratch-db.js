import { createClient } from "@supabase/supabase-js";

const supabase = createClient("https://mhtxknpdpakjvhlhrgwq.supabase.co", "sb_publishable_DXXJItmPtQR9M-JK62WRFA_Ty02EuCC");

async function run() {
  console.log("Checking interpreters schema...");
  const { data: interpreters, error } = await supabase
    .from("interpreters")
    .select("*")
    .limit(1);
  if (error) {
    console.error("Error fetching interpreters:", error);
  } else {
    console.log("Interpreters keys:", interpreters.length > 0 ? Object.keys(interpreters[0]) : "No data to check keys");
    console.log("Interpreter data sample:", interpreters[0]);
  }
}

run();
