import { createContext, useContext, useCallback, useEffect, useState } from "react";
import { supabase, supabaseConfigError } from "../supabase";

// 관리자 이메일 하드코딩 (DB 장애/누락 시 최종 백업)
export const ADMIN_EMAILS = [
  "onlinkwith@gmail.com",
  "onlinkcp@gmail.com",
];

export function normalizeEmail(value) {
  if (typeof value !== "string") return "";
  return value.trim().toLowerCase();
}

/**
 * 관리자 판정 통합 함수
 * 1순위: onlinkwith@gmail.com owner fallback
 * 2순위: admin_users DB 레코드 (email 일치 && status === "active")
 */
export function isAdminUser(user, adminProfile) {
  if (!user) return false;
  const email = normalizeEmail(user.email);
  if (!email) return false;
  // 1. owner fallback
  if (ADMIN_EMAILS.includes(email)) return true;
  // 2. DB 레코드 기반
  if (
    adminProfile &&
    normalizeEmail(adminProfile.email) === email &&
    adminProfile.status === "active"
  ) return true;
  return false;
}

function getAuthError() {
  return supabase ? null : supabaseConfigError;
}

const AuthContext = createContext({
  session: null,
  user: null,
  loading: true,
  signOut: async () => ({ error: null }),
  authError: null,
  isAdmin: false,
  adminProfile: null,
});

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [user, setUser] = useState(null);
  const [adminProfile, setAdminProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [authReady, setAuthReady] = useState(false);
  const authError = getAuthError();

  useEffect(() => {
    if (!supabase) {
      queueMicrotask(() => {
        setAuthReady(true);
        setLoading(false);
      });
      return undefined;
    }

    let mounted = true;

    // 1. Get initial session
    supabase.auth.getSession().then(({ data, error }) => {
      if (!mounted) return;
      if (error) console.error("Auth session fetch failed", error);
      setSession(data?.session || null);
      setUser(data?.session?.user || null);
      setAuthReady(true);
    });

    // 2. Listen for auth state changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (!mounted) return;
      console.log("onAuthStateChange event:", event, nextSession);
      setSession(nextSession || null);
      setUser(nextSession?.user || null);
      setAuthReady(true);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  // admin_users 테이블에서 프로필 조회 (실패해도 이메일 백업으로 판정)
  useEffect(() => {
    if (!authReady) return;

    if (!supabase || !user) {
      setAdminProfile(null);
      setLoading(false);
      return;
    }

    let mounted = true;

    const fetchAdminProfile = async () => {
      const email = normalizeEmail(user.email);
      const { data, error } = await supabase
        .from("admin_users")
        .select("id, email, role, status, created_at")
        .ilike("email", email)
        .maybeSingle();

      if (!mounted) return;

      if (error) {
        // 테이블이 없거나 조회 실패 시 → 이메일 백업으로 판정
        console.warn("admin_users fetch skipped (table may not exist):", error.message);
        setAdminProfile(null);
      } else {
        setAdminProfile(data || null);
      }

      setLoading(false);
    };

    fetchAdminProfile();

    return () => {
      mounted = false;
    };
  }, [authReady, user]);

  const signOut = useCallback(async () => {
    if (!supabase) return { error: supabaseConfigError };
    const { error } = await supabase.auth.signOut();
    if (error) console.error("Sign out failed", error);
    return { error };
  }, []);

  useEffect(() => {
    if (!supabase || !user) return undefined;

    let lastActivityTime = Date.now();
    const timeoutDuration = 30 * 60 * 1000; // 30 minutes

    const updateActivity = () => {
      lastActivityTime = Date.now();
    };

    const activityEvents = [
      "mousemove",
      "mousedown",
      "keydown",
      "scroll",
      "touchstart",
    ];

    activityEvents.forEach((event) => {
      window.addEventListener(event, updateActivity, { passive: true });
    });

    const interval = setInterval(async () => {
      const elapsed = Date.now() - lastActivityTime;
      if (elapsed >= timeoutDuration) {
        clearInterval(interval);
        activityEvents.forEach((event) => {
          window.removeEventListener(event, updateActivity);
        });

        try {
          await supabase.auth.signOut();
        } catch (err) {
          console.error("Auto sign out failed", err);
        }

        alert("30분 이상 활동이 없어 자동 로그아웃되었습니다.");
        window.location.href = "/login";
      }
    }, 10000); // Check inactivity every 10 seconds

    return () => {
      clearInterval(interval);
      activityEvents.forEach((event) => {
        window.removeEventListener(event, updateActivity);
      });
    };
  }, [user]);

  const isAdmin = isAdminUser(user, adminProfile);

  return (
    <AuthContext.Provider
      value={{
        session,
        user,
        loading,
        signOut,
        authError,
        isAdmin,
        adminProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
