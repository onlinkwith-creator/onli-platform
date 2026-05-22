import { useCallback, useEffect, useState } from "react";
import { supabase, supabaseConfigError } from "../supabase";

function getAuthError() {
  return supabase ? null : supabaseConfigError;
}

export function useAuth() {
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

    supabase.auth.getSession().then(({ data, error }) => {
      if (!mounted) return;
      if (error) console.error("Auth session fetch failed", error);
      setSession(data?.session || null);
      setUser(data?.session?.user || null);
      setLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
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
    if (error) console.error("Interpreter sign out failed", error);
    return { error };
  }, []);

  return {
    session,
    user,
    loading,
    signOut,
    authError,
  };
}
