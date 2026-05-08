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
  /** True når signup trigget OTP-utsending og UI bør gå til "skriv inn kode"-steg. */
  otpRequired?: boolean;
  /** Det normaliserte E.164-nummeret som ble brukt — gi det videre til verifyPhoneOtp. */
  phone?: string;
}

interface AuthContextValue {
  session: Session | null;
  user: User | null;
  profile: ProfileLite | null;
  loading: boolean;
  signUpWithPhone: (phone: string, password: string) => Promise<AuthResult>;
  signInWithPhone: (phone: string, password: string) => Promise<AuthResult>;
  verifyPhoneOtp: (phone: string, code: string) => Promise<AuthResult>;
  resendPhoneOtp: (phone: string) => Promise<AuthResult>;
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

  const signUpWithPhone = async (phoneInput: string, password: string): Promise<AuthResult> => {
    const phone = normalizePhone(phoneInput);
    if (!phone) return { error: "Ugyldig telefonnummer" };
    if (password.length < PASSWORD_MIN) {
      return { error: `Passordet må være minst ${PASSWORD_MIN} tegn` };
    }
    const { data, error } = await supabase.auth.signUp({ phone, password });
    if (error) {
      // Hvis brukeren signet opp før men ikke verifiserte, sender vi en ny OTP
      // og hopper rett til OTP-steget.
      if (
        error.message.toLowerCase().includes("already registered") ||
        error.message.toLowerCase().includes("phone already")
      ) {
        const resend = await supabase.auth.resend({ type: "sms", phone });
        if (!resend.error) {
          return { otpRequired: true, phone };
        }
        return { error: "Denne telefonen er allerede registrert. Logg inn i stedet." };
      }
      return { error: humanReadableError(error.message) };
    }
    // Hvis Supabase returnerer en session umiddelbart, er konfigurasjonen
    // "Confirm phone" av — bruker er pålogget. Ellers ble en OTP sendt.
    if (data.session) return {};
    return { otpRequired: true, phone };
  };

  const verifyPhoneOtp = async (phone: string, code: string): Promise<AuthResult> => {
    const cleanCode = code.replace(/\D/g, "");
    if (cleanCode.length < 4) return { error: "Skriv inn hele koden" };
    const { error } = await supabase.auth.verifyOtp({
      phone,
      token: cleanCode,
      type: "sms",
    });
    if (error) return { error: humanReadableError(error.message) };
    return {};
  };

  const resendPhoneOtp = async (phone: string): Promise<AuthResult> => {
    const { error } = await supabase.auth.resend({ type: "sms", phone });
    if (error) return { error: humanReadableError(error.message) };
    return {};
  };

  const signInWithPhone = async (phoneInput: string, password: string): Promise<AuthResult> => {
    const phone = normalizePhone(phoneInput);
    if (!phone) return { error: "Ugyldig telefonnummer" };
    const { error } = await supabase.auth.signInWithPassword({ phone, password });
    if (error) {
      // Bruker som signet opp men aldri bekreftet OTP — send dem til OTP-steget.
      if (
        error.message.toLowerCase().includes("not confirmed") ||
        error.message.toLowerCase().includes("phone not verified")
      ) {
        await supabase.auth.resend({ type: "sms", phone });
        return { otpRequired: true, phone };
      }
      return { error: humanReadableError(error.message) };
    }
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
        verifyPhoneOtp,
        resendPhoneOtp,
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
  if (lower.includes("token has expired") || lower.includes("invalid otp") || lower.includes("token is invalid")) {
    return "Koden er ugyldig eller utløpt. Be om en ny.";
  }
  if (lower.includes("rate limit") || lower.includes("too many")) {
    return "For mange forsøk. Vent et minutt og prøv igjen.";
  }
  if (lower.includes("password")) return "Passordet er ikke gyldig";
  return raw;
}
