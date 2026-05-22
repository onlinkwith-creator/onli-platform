import { createClient } from "@supabase/supabase-js";

const rawUrl = import.meta.env.VITE_SUPABASE_URL;
const rawAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

const supabaseUrl = rawUrl?.trim();
const supabaseAnonKey = rawAnonKey?.trim();

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

export const supabase = createClient(supabaseUrl || "", supabaseAnonKey || "");
export const publicSupabase = supabase;
