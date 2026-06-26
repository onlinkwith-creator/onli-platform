import { createClient } from "@supabase/supabase-js";

const rawUrl = import.meta.env.VITE_SUPABASE_URL;
const rawAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

function cleanEnvValue(value) {
  return String(value || "")
    .trim()
    .replace(/^['"]|['"]$/g, "")
    .split(/\s+/)[0]
    .trim();
}

let cleanedUrl = rawUrl?.trim() || "";
cleanedUrl = cleanedUrl.replace(/\/+$/, "");
cleanedUrl = cleanedUrl.replace(/\/rest\/v1\/?$/, "");
cleanedUrl = cleanedUrl.replace(/\/+$/, "");
const supabaseUrl = cleanedUrl;
const supabaseAnonKey = cleanEnvValue(rawAnonKey);

console.log("Supabase env check:", {
  hasUrl: Boolean(supabaseUrl),
  hasAnonKey: Boolean(supabaseAnonKey),
  url: supabaseUrl,
});

function isValidSupabaseUrl(value) {
  return typeof value === "string" && /^https:\/\/.+\.supabase\.co\/?$/.test(value);
}

export const supabaseConfigError = {
  message:
    "Supabase 연결 설정이 필요합니다. .env.local의 VITE_SUPABASE_URL과 VITE_SUPABASE_ANON_KEY를 확인해주세요.",
  code: "MISSING_SUPABASE_CONFIG",
};

export const isSupabaseConfigured =
  isValidSupabaseUrl(supabaseUrl) &&
  typeof supabaseAnonKey === "string" &&
  supabaseAnonKey.trim().length > 0;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error("Missing Supabase environment variables");
}

if (supabaseUrl && !supabaseUrl.startsWith("https://")) {
  console.error("Invalid Supabase URL format:", supabaseUrl);
}

if (supabaseUrl && supabaseUrl.includes("/rest/v1")) {
  console.error(
    "VITE_SUPABASE_URL must be project URL only, not REST URL:",
    supabaseUrl
  );
}

export const supabase = createClient(supabaseUrl || "", supabaseAnonKey || "", {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});
export const publicSupabase = supabase;
