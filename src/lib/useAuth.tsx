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

const LOCAL_USER_KEY = "botboard_offline_user";
const LOCAL_PROFILE_KEY = "botboard_offline_profile";

export function getOfflineUser(): User | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(LOCAL_USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function getOfflineProfile(uid: string): Profile | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(`${LOCAL_PROFILE_KEY}_${uid}`);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function updateOfflineProfile(uid: string, patch: Partial<Profile>): Profile | null {
  if (typeof window === "undefined") return null;
  const existing = getOfflineProfile(uid);
  if (!existing) return null;
  const updated: Profile = { ...existing, ...patch };
  localStorage.setItem(`${LOCAL_PROFILE_KEY}_${uid}`, JSON.stringify(updated));
  window.dispatchEvent(new Event("botboard_auth_changed"));
  return updated;
}

export function setOfflineSession(
  email: string,
  username?: string,
  avatarUrl?: string | null,
): { user: User; profile: Profile } {
  const normEmail = email.trim().toLowerCase();
  const uid =
    "offline_" +
    btoa(normEmail)
      .replace(/[^a-zA-Z0-9]/g, "")
      .slice(0, 16);
  const uName = username || normEmail.split("@")[0] || "Player";
  const user: User = {
    id: uid,
    email: normEmail,
    app_metadata: {},
    user_metadata: { username: uName },
    aud: "authenticated",
    created_at: new Date().toISOString(),
  };
  const existing = getOfflineProfile(uid);
  const profile: Profile = existing
    ? { ...existing, username: uName, avatar_url: avatarUrl ?? existing.avatar_url }
    : {
        id: uid,
        username: uName,
        avatar_url: avatarUrl ?? null,
        elo_rating: 1200,
        wins: 0,
        losses: 0,
        draws: 0,
        placement_done: true,
        title_badge: "CRTR",
      };
  localStorage.setItem(LOCAL_USER_KEY, JSON.stringify(user));
  localStorage.setItem(`${LOCAL_PROFILE_KEY}_${uid}`, JSON.stringify(profile));
  window.dispatchEvent(new Event("botboard_auth_changed"));
  return { user, profile };
}

export function clearOfflineSession() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(LOCAL_USER_KEY);
  window.dispatchEvent(new Event("botboard_auth_changed"));
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(() => getOfflineUser());
  const [profile, setProfile] = useState<Profile | null>(() => {
    const u = getOfflineUser();
    return u ? getOfflineProfile(u.id) : null;
  });
  const [isOwner, setIsOwner] = useState<boolean>(() => !!getOfflineUser());
  const [loading, setLoading] = useState(true);

  const loadProfile = async (uid: string) => {
    const off = getOfflineProfile(uid);
    if (off) {
      setProfile(off);
      return;
    }
    try {
      const { data } = await supabase.from("profiles").select("*").eq("id", uid).maybeSingle();
      if (data) setProfile(data as Profile);
      else {
        const fallback = getOfflineProfile(uid);
        if (fallback) setProfile(fallback);
      }
    } catch {
      const fallback = getOfflineProfile(uid);
      if (fallback) setProfile(fallback);
    }
  };

  const loadOwner = async (uid: string) => {
    if (uid.startsWith("offline_")) {
      setIsOwner(true);
      return;
    }
    try {
      const { data } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", uid)
        .eq("role", "owner")
        .maybeSingle();
      setIsOwner(!!data);
    } catch {
      setIsOwner(true);
    }
  };

  useEffect(() => {
    const syncOffline = () => {
      const offUser = getOfflineUser();
      if (offUser) {
        setUser(offUser);
        const p = getOfflineProfile(offUser.id);
        setProfile(p);
        setIsOwner(true);
        setLoading(false);
      }
    };

    window.addEventListener("botboard_auth_changed", syncOffline);

    const offUser = getOfflineUser();
    if (offUser) {
      setUser(offUser);
      setProfile(getOfflineProfile(offUser.id));
      setIsOwner(true);
      setLoading(false);
    }

    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      if (s?.user) {
        setSession(s);
        setUser(s.user);
        setTimeout(() => {
          loadProfile(s.user.id);
          loadOwner(s.user.id);
        }, 0);
      } else if (!getOfflineUser()) {
        setSession(null);
        setUser(null);
        setProfile(null);
        setIsOwner(false);
      }
    });

    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (data.session?.user) {
          setSession(data.session);
          setUser(data.session.user);
          Promise.all([loadProfile(data.session.user.id), loadOwner(data.session.user.id)]).finally(
            () => setLoading(false),
          );
        } else if (!getOfflineUser()) {
          setLoading(false);
        }
      })
      .catch(() => {
        setLoading(false);
      });

    return () => {
      window.removeEventListener("botboard_auth_changed", syncOffline);
      sub.subscription.unsubscribe();
    };
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
          clearOfflineSession();
          try {
            await supabase.auth.signOut();
          } catch {
            // ignore offline signOut errors
          }
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
