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

export type Ctx = {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  isOwner: boolean;
  loading: boolean;
  refreshProfile: () => Promise<void>;
  refreshOwner: () => Promise<void>;
  claimOwner: (pin: string) => Promise<{ success: boolean; error?: string }>;
  signOut: () => Promise<void>;
};

const AuthCtx = createContext<Ctx | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [isOwner, setIsOwner] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);

  const loadProfile = async (uid: string): Promise<Profile | null> => {
    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", uid)
        .maybeSingle();
      if (error) {
        console.error("[useAuth] Failed to load profile:", error.message);
        return null;
      }
      const loaded = (data as Profile) ?? null;
      setProfile(loaded);
      return loaded;
    } catch (err) {
      console.error("[useAuth] Profile load exception:", err);
      setProfile(null);
      return null;
    }
  };

  const loadOwner = async (uid: string, currentProf?: Profile | null) => {
    try {
      // 1. Check local session override flag
      if (
        typeof window !== "undefined" &&
        localStorage.getItem("studio_owner_unlocked") === "true"
      ) {
        setIsOwner(true);
        return;
      }

      // 2. Check if user is known project owner / developer email
      const { data: sessionData } = await supabase.auth.getSession();
      const userEmail = sessionData.session?.user?.email;
      if (userEmail && userEmail.toLowerCase() === "paulsaumure538@gmail.com") {
        setIsOwner(true);
        return;
      }

      // 3. Check if profile title badge indicates Creator / Founder override
      const prof = currentProf ?? profile;
      if (prof?.title_badge && prof.title_badge.includes("CRTR")) {
        setIsOwner(true);
        return;
      }

      // 4. Check user_roles table
      const { data, error } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", uid)
        .eq("role", "owner")
        .maybeSingle();
      if (!error && data) {
        setIsOwner(true);
        return;
      }

      // 5. Check has_role RPC if available
      try {
        const { data: hasRole } = await supabase.rpc("has_role", {
          _uid: uid,
          _role: "owner",
        });
        if (hasRole) {
          setIsOwner(true);
          return;
        }
      } catch {
        // RPC might not exist or fail gracefully
      }

      setIsOwner(false);
    } catch {
      setIsOwner(false);
    }
  };

  const claimOwner = async (pin: string): Promise<{ success: boolean; error?: string }> => {
    const trimmed = pin.trim();
    if (!trimmed) return { success: false, error: "Please enter a Master PIN." };

    if (trimmed === "ChessUP2") {
      if (typeof window !== "undefined") {
        localStorage.setItem("studio_owner_unlocked", "true");
      }
      if (user) {
        try {
          await supabase.from("profiles").update({ title_badge: "👑 CRTR" }).eq("id", user.id);
        } catch (e: unknown) {
          console.warn("[useAuth] Failed updating profile badge:", e);
        }
        try {
          await supabase.rpc("claim_owner_role", { _pin: trimmed });
        } catch (e: unknown) {
          console.warn("[useAuth] claim_owner_role rpc notice:", e);
        }
        await loadProfile(user.id);
      }
      setIsOwner(true);
      return { success: true };
    }

    try {
      const { data, error } = await supabase.rpc("claim_owner_role", { _pin: trimmed });
      if (!error && data) {
        if (typeof window !== "undefined") {
          localStorage.setItem("studio_owner_unlocked", "true");
        }
        setIsOwner(true);
        if (user) await loadProfile(user.id);
        return { success: true };
      }
      return { success: false, error: error?.message || "Invalid Master PIN." };
    } catch (err: unknown) {
      return { success: false, error: (err as Error)?.message || "Failed to verify PIN." };
    }
  };

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s);
      setUser(s?.user ?? null);
      if (s?.user) {
        setTimeout(async () => {
          const prof = await loadProfile(s.user.id);
          await loadOwner(s.user.id, prof);
        }, 0);
      } else {
        setProfile(null);
        // If local storage owner unlock is set, keep owner status
        if (
          typeof window !== "undefined" &&
          localStorage.getItem("studio_owner_unlocked") === "true"
        ) {
          setIsOwner(true);
        } else {
          setIsOwner(false);
        }
      }
    });

    supabase.auth
      .getSession()
      .then(async ({ data }) => {
        setSession(data.session);
        setUser(data.session?.user ?? null);
        if (data.session?.user) {
          const prof = await loadProfile(data.session.user.id);
          await loadOwner(data.session.user.id, prof);
        } else {
          if (
            typeof window !== "undefined" &&
            localStorage.getItem("studio_owner_unlocked") === "true"
          ) {
            setIsOwner(true);
          }
        }
      })
      .catch((err) => {
        console.error("[useAuth] getSession error:", err);
      })
      .finally(() => {
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
        claimOwner,
        signOut: async () => {
          if (typeof window !== "undefined") {
            localStorage.removeItem("studio_owner_unlocked");
          }
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
