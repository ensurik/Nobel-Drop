import { useEffect, useRef, useState } from "react";
import { View, Text, TextInput, ScrollView, Pressable } from "react-native";
import { Stack, router } from "expo-router";
import { Button } from "../../components/ui/Button";
import { useAuth } from "../../lib/auth";
import { formatPhone } from "../../lib/phone";

type Mode = "signin" | "signup";
type Step = "credentials" | "otp";

const RESEND_COOLDOWN = 60; // sek

export default function Login() {
  const { signInWithPhone, signUpWithPhone, verifyPhoneOtp, resendPhoneOtp } = useAuth();

  const [mode, setMode] = useState<Mode>("signin");
  const [step, setStep] = useState<Step>("credentials");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [otpPhone, setOtpPhone] = useState<string | null>(null); // E.164 fra signup-respons
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [resendIn, setResendIn] = useState(0);

  const codeRef = useRef<TextInput | null>(null);

  // Cooldown-counter
  useEffect(() => {
    if (resendIn <= 0) return;
    const t = setTimeout(() => setResendIn((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [resendIn]);

  // Auto-focus OTP-feltet når vi går til kode-steget
  useEffect(() => {
    if (step === "otp") {
      const t = setTimeout(() => codeRef.current?.focus(), 100);
      return () => clearTimeout(t);
    }
  }, [step]);

  const submitCredentials = async () => {
    setLoading(true);
    setErr(null);
    const fn = mode === "signin" ? signInWithPhone : signUpWithPhone;
    const res = await fn(phone, password);
    setLoading(false);

    if (res.error) {
      setErr(res.error);
      return;
    }
    if (res.otpRequired) {
      setOtpPhone(res.phone ?? null);
      setStep("otp");
      setResendIn(RESEND_COOLDOWN);
      return;
    }
    // Direkte innlogget (signin med riktig passord på en bekreftet konto)
    router.replace("/");
  };

  const submitCode = async () => {
    if (!otpPhone) return;
    setLoading(true);
    setErr(null);
    const res = await verifyPhoneOtp(otpPhone, code);
    setLoading(false);
    if (res.error) {
      setErr(res.error);
      return;
    }
    router.replace("/");
  };

  // Auto-send når 6 sifre er skrevet
  const onCodeChange = (text: string) => {
    const cleaned = text.replace(/\D/g, "").slice(0, 6);
    setCode(cleaned);
    if (cleaned.length === 6 && !loading) {
      // Liten timeout for å la state oppdatere før verifiser
      setTimeout(() => submitCode(), 100);
    }
  };

  const resend = async () => {
    if (!otpPhone || resendIn > 0) return;
    setErr(null);
    const res = await resendPhoneOtp(otpPhone);
    if (res.error) setErr(res.error);
    else setResendIn(RESEND_COOLDOWN);
  };

  const backToCredentials = () => {
    setStep("credentials");
    setCode("");
    setErr(null);
  };

  const isSignup = mode === "signup";
  const isOtp = step === "otp";

  return (
    <View className="flex-1 bg-ink-900">
      <Stack.Screen options={{ headerShown: false }} />
      <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: "center", padding: 24 }}>
        <View className="items-center mb-12">
          <Text className="font-display text-5xl text-gold tracking-wide">Nobel Drop</Text>
          <Text className="text-bone-400 mt-2 text-center">
            Eksklusive delikatesser. Begrenset antall.
          </Text>
        </View>

        {/* Tab-toggle (skjult i OTP-steget) */}
        {!isOtp && (
          <View className="flex-row bg-ink-800 border border-ink-600 rounded-full p-1 mb-8 self-center">
            <Pressable
              onPress={() => { setMode("signin"); setErr(null); }}
              className={`px-6 py-2 rounded-full ${mode === "signin" ? "bg-gold" : ""}`}
            >
              <Text className={`font-sans-medium text-sm ${mode === "signin" ? "text-ink-900" : "text-bone-400"}`}>
                Logg inn
              </Text>
            </Pressable>
            <Pressable
              onPress={() => { setMode("signup"); setErr(null); }}
              className={`px-6 py-2 rounded-full ${mode === "signup" ? "bg-gold" : ""}`}
            >
              <Text className={`font-sans-medium text-sm ${mode === "signup" ? "text-ink-900" : "text-bone-400"}`}>
                Opprett konto
              </Text>
            </Pressable>
          </View>
        )}

        {/* STEP 1: telefon + passord */}
        {!isOtp && (
          <View className="gap-4 max-w-md w-full self-center">
            <View>
              <Text className="text-bone-400 mb-2 uppercase tracking-widest text-xs">Telefon</Text>
              <TextInput
                value={phone}
                onChangeText={setPhone}
                placeholder="98 76 54 32"
                placeholderTextColor="#5A574E"
                autoCapitalize="none"
                autoComplete="tel"
                keyboardType="phone-pad"
                textContentType="telephoneNumber"
                className="bg-ink-800 border border-ink-600 rounded-md px-4 py-3 text-bone-100"
              />
            </View>

            <View>
              <Text className="text-bone-400 mb-2 uppercase tracking-widest text-xs">Passord</Text>
              <TextInput
                value={password}
                onChangeText={setPassword}
                placeholder={isSignup ? "Minst 8 tegn" : "Passord"}
                placeholderTextColor="#5A574E"
                autoCapitalize="none"
                autoComplete={isSignup ? "new-password" : "current-password"}
                secureTextEntry
                textContentType={isSignup ? "newPassword" : "password"}
                onSubmitEditing={submitCredentials}
                className="bg-ink-800 border border-ink-600 rounded-md px-4 py-3 text-bone-100"
              />
              {isSignup && (
                <Text className="text-bone-500 text-xs mt-2">
                  Vi sender en kode på SMS for å bekrefte nummeret. Velg et passord du husker.
                </Text>
              )}
            </View>

            {err ? <Text className="text-danger text-sm">{err}</Text> : null}

            <Button onPress={submitCredentials} loading={loading} fullWidth>
              {isSignup ? "Opprett konto" : "Logg inn"}
            </Button>

            <Text className="text-bone-500 text-xs text-center mt-2">
              Ved å {isSignup ? "opprette konto" : "logge inn"} godtar du vår{" "}
              <Text className="text-gold">personvernerklæring</Text> og{" "}
              <Text className="text-gold">vilkårene</Text>.
            </Text>
          </View>
        )}

        {/* STEP 2: SMS-kode */}
        {isOtp && (
          <View className="gap-4 max-w-md w-full self-center">
            <Text className="text-bone-100 font-display text-2xl text-center">
              Skriv inn koden
            </Text>
            <Text className="text-bone-400 text-center">
              Vi sendte en 6-sifret kode til{" "}
              <Text className="text-bone-100">{formatPhone(otpPhone)}</Text>
            </Text>

            <TextInput
              ref={codeRef}
              value={code}
              onChangeText={onCodeChange}
              placeholder="······"
              placeholderTextColor="#5A574E"
              keyboardType="number-pad"
              textContentType="oneTimeCode"
              autoComplete="sms-otp"
              maxLength={6}
              className="bg-ink-800 border border-gold-deep rounded-md px-4 py-4 text-bone-100 text-center text-3xl tracking-[0.6em] mt-4"
            />

            {err ? <Text className="text-danger text-sm text-center">{err}</Text> : null}

            <Button onPress={submitCode} loading={loading} disabled={code.length < 4} fullWidth>
              Bekreft
            </Button>

            <View className="items-center mt-2">
              {resendIn > 0 ? (
                <Text className="text-bone-500 text-xs">
                  Send ny kode om {resendIn} sek
                </Text>
              ) : (
                <Pressable onPress={resend}>
                  <Text className="text-gold text-xs">Send ny kode</Text>
                </Pressable>
              )}
            </View>

            <Pressable onPress={backToCredentials} className="items-center mt-2">
              <Text className="text-bone-500 text-xs">Tilbake</Text>
            </Pressable>
          </View>
        )}
      </ScrollView>
    </View>
  );
}
