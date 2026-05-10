import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

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

if (!isSupabaseConfigured) {
  console.error(
    "Invalid or missing Supabase environment variables. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY."
  );
}

export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null;
