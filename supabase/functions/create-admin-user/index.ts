import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}

function normalizeEmail(value: unknown) {
  return String(value || "").trim().toLowerCase();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");

  if (!supabaseUrl || !serviceRoleKey || !anonKey) {
    return jsonResponse({ error: "Supabase environment is not configured" }, 500);
  }

  const authHeader = req.headers.get("Authorization") || "";
  const callerClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const adminClient = createClient(supabaseUrl, serviceRoleKey);

  const {
    data: { user: caller },
    error: callerError,
  } = await callerClient.auth.getUser();

  if (callerError || !caller?.email) {
    return jsonResponse({ error: "Unauthorized" }, 401);
  }

  const { data: callerAdmin, error: adminCheckError } = await adminClient
    .from("admin_users")
    .select("id, role, status")
    .or(`auth_user_id.eq.${caller.id},email.ilike.${caller.email}`)
    .eq("status", "active")
    .single();

  if (adminCheckError || !callerAdmin || !["owner", "admin"].includes(callerAdmin.role)) {
    return jsonResponse({ error: "Forbidden" }, 403);
  }

  const body = await req.json().catch(() => ({}));
  const email = normalizeEmail(body.email);
  const password = String(body.password || "");
  const role = ["owner", "admin", "staff"].includes(body.role) ? body.role : "staff";

  if (!email || !email.includes("@")) {
    return jsonResponse({ error: "Valid email is required" }, 400);
  }

  if (!password || password.length < 8) {
    return jsonResponse({ error: "Temporary password must be at least 8 characters" }, 400);
  }

  const { data: createdUser, error: createError } =
    await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { admin_role: role },
    });

  if (createError) {
    return jsonResponse({ error: createError.message }, 400);
  }

  const authUserId = createdUser.user?.id || null;
  const { data: adminUser, error: upsertError } = await adminClient
    .from("admin_users")
    .upsert(
      {
        auth_user_id: authUserId,
        email,
        role,
        status: "active",
        updated_at: new Date().toISOString(),
      },
      { onConflict: "email" }
    )
    .select("id, auth_user_id, email, role, status, created_at, updated_at")
    .single();

  if (upsertError) {
    return jsonResponse({ error: upsertError.message }, 400);
  }

  return jsonResponse({ adminUser });
});
