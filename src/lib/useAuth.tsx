import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export type Profile = {
  id: string;
  username: string;
  avatar_url: string | null;
  elo_rating: number;
  wins: number;
  losses: number;
  draws: number;
  placement_done: boolean;
  profile_icon?: string | null;
  title_badge?: string | null;
  status_text?: string | null;
  country?: string | null;
  verified_federation?: string | null;
  created_at?: string;
};

type Ctx = {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  isOwner: boolean;
  loading: boolean;
  refreshProfile: () => Promise<void>;
  refreshOwner: () => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthCtx = createContext<Ctx | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [isOwner, setIsOwner] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);

  const loadProfile = async (uid: string) => {
    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", uid)
        .maybeSingle();
      if (error) {
        console.error("[useAuth] Failed to load profile:", error.message);
        return;
      }
      setProfile((data as Profile) ?? null);
    } catch (err) {
      console.error("[useAuth] Profile load exception:", err);
      setProfile(null);
    }
  };

  const loadOwner = async (uid: string) => {
    try {
      const { data, error } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", uid)
        .eq("role", "owner")
        .maybeSingle();
      if (error) {
        setIsOwner(false);
        return;
      }
      setIsOwner(!!data);
    } catch {
      setIsOwner(false);
    }
  };

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s);
      setUser(s?.user ?? null);
      if (s?.user) {
        setTimeout(() => {
          loadProfile(s.user.id);
          loadOwner(s.user.id);
        }, 0);
      } else {
        setProfile(null);
        setIsOwner(false);
      }
    });

    supabase.auth
      .getSession()
      .then(({ data }) => {
        setSession(data.session);
        setUser(data.session?.user ?? null);
        if (data.session?.user) {
          Promise.all([loadProfile(data.session.user.id), loadOwner(data.session.user.id)]).finally(
            () => setLoading(false),
          );
        } else {
          setLoading(false);
        }
      })
      .catch((err) => {
        console.error("[useAuth] getSession error:", err);
        setLoading(false);
      });

    return () => sub.subscription.unsubscribe();
  }, []);

  return (
    <AuthCtx.Provider
      value={{
        user,
        session,
        profile,
        isOwner,
        loading,
        refreshProfile: async () => {
          if (user) await loadProfile(user.id);
        },
        refreshOwner: async () => {
          if (user) await loadOwner(user.id);
        },
        signOut: async () => {
          await supabase.auth.signOut();
          setUser(null);
          setSession(null);
          setProfile(null);
          setIsOwner(false);
        },
      }}
    >
      {children}
    </AuthCtx.Provider>
  );
}

export function useAuth() {
  const c = useContext(AuthCtx);
  if (!c) throw new Error("useAuth must be used within AuthProvider");
  return c;
}
