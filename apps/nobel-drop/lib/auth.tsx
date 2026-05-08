import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "./supabase";
import { normalizePhone } from "./phone";

interface ProfileLite {
  id: string;
  full_name: string | null;
  phone: string | null;
  role: "customer" | "admin" | "driver";
  push_enabled: boolean;
}

interface AuthResult {
  error?: string;
}

interface AuthContextValue {
  session: Session | null;
  user: User | null;
  profile: ProfileLite | null;
  loading: boolean;
  signUpWithPhone: (phone: string, password: string) => Promise<AuthResult>;
  signInWithPhone: (phone: string, password: string) => Promise<AuthResult>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

const PASSWORD_MIN = 8;

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<ProfileLite | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, sess) => {
      setSession(sess);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session?.user) {
      setProfile(null);
      return;
    }
    supabase
      .from("profiles")
      .select("id, full_name, phone, role, push_enabled")
      .eq("id", session.user.id)
      .single()
      .then(({ data }) => setProfile(data as ProfileLite | null));
  }, [session]);

  const signUpWithPhone = async (phone: string, password: string): Promise<AuthResult> => {
    const normalized = normalizePhone(phone);
    if (!normalized) return { error: "Ugyldig telefonnummer" };
    if (password.length < PASSWORD_MIN) {
      return { error: `Passordet må være minst ${PASSWORD_MIN} tegn` };
    }
    const { error } = await supabase.auth.signUp({
      phone: normalized,
      password,
    });
    if (error) return { error: humanReadableError(error.message) };
    return {};
  };

  const signInWithPhone = async (phone: string, password: string): Promise<AuthResult> => {
    const normalized = normalizePhone(phone);
    if (!normalized) return { error: "Ugyldig telefonnummer" };
    const { error } = await supabase.auth.signInWithPassword({
      phone: normalized,
      password,
    });
    if (error) return { error: humanReadableError(error.message) };
    return {};
  };

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider
      value={{
        session,
        user: session?.user ?? null,
        profile,
        loading,
        signUpWithPhone,
        signInWithPhone,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth må brukes innenfor <AuthProvider>");
  return ctx;
}

function humanReadableError(raw: string): string {
  const lower = raw.toLowerCase();
  if (lower.includes("invalid login credentials")) return "Feil telefonnummer eller passord";
  if (lower.includes("phone already")) return "Denne telefonen er allerede registrert. Logg inn i stedet.";
  if (lower.includes("user already registered")) return "Denne telefonen er allerede registrert. Logg inn i stedet.";
  if (lower.includes("password")) return "Passordet er ikke gyldig";
  if (lower.includes("rate limit")) return "For mange forsøk. Prøv igjen om litt.";
  return raw;
}
