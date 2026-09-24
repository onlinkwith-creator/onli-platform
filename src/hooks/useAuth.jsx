import { createContext, useContext, useCallback, useEffect, useState } from "react";
import { supabase, supabaseConfigError } from "../supabase";

export function normalizeEmail(value) {
  if (typeof value !== "string") return "";
  return value.trim().toLowerCase();
}

/**
 * 관리자 판정 통합 함수
 * admin_users의 Auth 사용자 연결과 활성 상태로만 관리자 권한을 판정합니다.
 */
export function isAdminUser(user, adminProfile) {
  if (!user) return false;
  return Boolean(
    adminProfile &&
      adminProfile.auth_user_id === user.id &&
      adminProfile.status === "active" &&
      ["owner", "admin", "staff"].includes(adminProfile.role)
  );
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
  const [resolvedAdminUserId, setResolvedAdminUserId] = useState(null);
  const [authReady, setAuthReady] = useState(false);
  const loading = !authReady || Boolean(user && resolvedAdminUserId !== user.id);
  const authError = getAuthError();

  useEffect(() => {
    if (!supabase) {
      queueMicrotask(() => {
        setAuthReady(true);
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
      setSession(nextSession || null);
      setUser(nextSession?.user || null);
      setAuthReady(true);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  // admin_users 테이블에서 현재 Auth 사용자와 연결된 관리자 프로필을 조회합니다.
  useEffect(() => {
    if (!authReady) return;

    if (!supabase || !user) {
      setAdminProfile(null);
      setResolvedAdminUserId(null);
      return;
    }

    let mounted = true;

    const fetchAdminProfile = async () => {
      const { data, error } = await supabase
        .from("admin_users")
        .select("id, auth_user_id, email, role, status, created_at")
        .eq("auth_user_id", user.id)
        .maybeSingle();

      if (!mounted) return;

      if (error) {
        console.warn("admin_users fetch failed:", error.message);
        setAdminProfile(null);
      } else {
        setAdminProfile(data || null);
      }

      setResolvedAdminUserId(user.id);
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
