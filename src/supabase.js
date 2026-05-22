import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim();
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim();

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
  console.error("Missing Supabase env vars:", {
    VITE_SUPABASE_URL: !!supabaseUrl,
    VITE_SUPABASE_ANON_KEY: !!supabaseAnonKey,
  });
}

if (!isSupabaseConfigured) {
  console.error(
    "Invalid Supabase env vars:",
    {
      VITE_SUPABASE_URL: supabaseUrl || "missing",
      VITE_SUPABASE_ANON_KEY: supabaseAnonKey ? "present" : "missing",
    }
  );
}

function createSupabaseClient(options) {
  try {
    return createClient(supabaseUrl || "", supabaseAnonKey || "", options);
  } catch (error) {
    console.error("Supabase client initialization failed:", error);
    return null;
  }
}

export const supabase = createSupabaseClient();

export const publicSupabase = createSupabaseClient({
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
});
