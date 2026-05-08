import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "./supabase";
import { normalizePhone } from "./phone";

interface ProfileLite {
  id: string;
  full_name: string | null;
  email: string | null;
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
  signUpWithEmail: (email: string, password: string, phone?: string) => Promise<AuthResult>;
  signInWithEmail: (email: string, password: string) => Promise<AuthResult>;
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
      .select("id, full_name, email, phone, role, push_enabled")
      .eq("id", session.user.id)
      .single()
      .then(({ data }) => setProfile(data as ProfileLite | null));
  }, [session]);

  const signUpWithEmail = async (
    email: string,
    password: string,
    phone?: string,
  ): Promise<AuthResult> => {
    const cleanEmail = email.trim().toLowerCase();
    if (!isValidEmail(cleanEmail)) return { error: "Ugyldig e-postadresse" };
    if (password.length < PASSWORD_MIN) {
      return { error: `Passordet må være minst ${PASSWORD_MIN} tegn` };
    }

    let normalizedPhone: string | null = null;
    if (phone && phone.trim().length > 0) {
      normalizedPhone = normalizePhone(phone);
      if (!normalizedPhone) return { error: "Telefonnummeret er ugyldig" };
    }

    const { data, error } = await supabase.auth.signUp({
      email: cleanEmail,
      password,
    });
    if (error) return { error: humanReadableError(error.message) };

    // Lagre telefon i profiles hvis brukeren ga det. Trigger har allerede
    // opprettet profil-raden via auth.users INSERT.
    if (normalizedPhone && data.user) {
      const { error: updateErr } = await supabase
        .from("profiles")
        .update({ phone: normalizedPhone })
        .eq("id", data.user.id);
      if (updateErr) {
        console.warn("Could not save phone to profile:", updateErr.message);
        // Ikke blokker signup på dette — bruker kan oppdatere senere fra Account.
      }
    }

    return {};
  };

  const signInWithEmail = async (email: string, password: string): Promise<AuthResult> => {
    const cleanEmail = email.trim().toLowerCase();
    if (!isValidEmail(cleanEmail)) return { error: "Ugyldig e-postadresse" };
    const { error } = await supabase.auth.signInWithPassword({
      email: cleanEmail,
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
        signUpWithEmail,
        signInWithEmail,
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

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function humanReadableError(raw: string): string {
  const lower = raw.toLowerCase();
  if (lower.includes("invalid login credentials")) return "Feil e-post eller passord";
  if (lower.includes("user already registered") || lower.includes("already exists")) {
    return "Denne e-posten er allerede registrert. Logg inn i stedet.";
  }
  if (lower.includes("password")) return "Passordet er ikke gyldig";
  if (lower.includes("email")) return "E-posten er ikke gyldig";
  if (lower.includes("rate limit") || lower.includes("too many")) {
    return "For mange forsøk. Vent et minutt og prøv igjen.";
  }
  return raw;
}
