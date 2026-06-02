import { createContext, useContext, useCallback, useEffect, useState } from "react";
import { supabase, supabaseConfigError } from "../supabase";
export const ADMIN_EMAILS = [
  "onlinkwith@gmail.com",
  "onlinkcp@gmail.com",
];

const AuthContext = createContext({
  session: null,
  user: null,
  loading: true,
  signOut: async () => ({ error: null }),
  authError: null,
  isAdmin: false,
  adminProfile: null,
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

  useEffect(() => {
    if (!authReady) return;

    if (!supabase) {
      queueMicrotask(() => {
        setAdminProfile(null);
        setLoading(false);
      });
      return;
    }

    if (!user) {
      queueMicrotask(() => {
        setAdminProfile(null);
        setLoading(false);
      });
      return;
    }

    let mounted = true;

    const fetchAdminProfile = async () => {
      const email = normalizeEmail(user.email);
      const { data, error } = await supabase
        .from("admin_users")
        .select("id, auth_user_id, email, role, status")
        .or(`auth_user_id.eq.${user.id},email.ilike.${email}`)
        .maybeSingle();

      if (!mounted) return;

      if (error) {
        console.warn("Admin profile fetch failed", error);
        setAdminProfile(null);
        setLoading(false);
        return;
      }

      if (data && !data.auth_user_id) {
        const { data: linkedProfile, error: linkError } = await supabase
          .from("admin_users")
          .update({ auth_user_id: user.id, updated_at: new Date().toISOString() })
          .eq("id", data.id)
          .select("id, auth_user_id, email, role, status")
          .single();

        if (!mounted) return;
        if (!linkError && linkedProfile) {
          setAdminProfile(linkedProfile);
        } else {
          if (linkError) console.warn("Admin auth link skipped", linkError);
          setAdminProfile(data);
        }
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

  const userEmail = user?.email ? normalizeEmail(user.email) : "";
  const isAdmin = Boolean(
    userEmail &&
      adminProfile &&
      normalizeEmail(adminProfile.email) === userEmail &&
      adminProfile.status === "active"
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
