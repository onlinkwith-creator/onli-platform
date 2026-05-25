import { createContext, useContext, useCallback, useEffect, useState } from "react";
import { supabase, supabaseConfigError } from "../supabase";
export const ADMIN_EMAILS = [
  "onlinkwith@gmail.com",
  "hyundle69@gmail.com",
  "onlinkcp@gmail.com",
];

const AuthContext = createContext({
  session: null,
  user: null,
  loading: true,
  signOut: async () => ({ error: null }),
  authError: null,
  isAdmin: false,
});

export function normalizeEmail(value) {
  if (typeof value !== "string") return "";
  return value.trim().toLowerCase();
}

function getAuthError() {
  return supabase ? null : supabaseConfigError;
}

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const authError = getAuthError();

  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      return undefined;
    }

    let mounted = true;

    // 1. Get initial session
    supabase.auth.getSession().then(({ data, error }) => {
      if (!mounted) return;
      if (error) console.error("Auth session fetch failed", error);
      setSession(data?.session || null);
      setUser(data?.session?.user || null);
      setLoading(false);
    });

    // 2. Listen for auth state changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (!mounted) return;
      console.log("onAuthStateChange event:", event, nextSession);
      setSession(nextSession || null);
      setUser(nextSession?.user || null);
      setLoading(false);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

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

  const userEmail = user?.email ? normalizeEmail(user.email) : "";
  const isAdmin = Boolean(
    userEmail &&
    ADMIN_EMAILS.some((email) => normalizeEmail(email) === userEmail)
  );

  return (
    <AuthContext.Provider
      value={{
        session,
        user,
        loading,
        signOut,
        authError,
        isAdmin,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}

