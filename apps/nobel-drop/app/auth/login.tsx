import { useState } from "react";
import { View, Text, TextInput, ScrollView, Pressable } from "react-native";
import { Stack, router } from "expo-router";
import { Button } from "../../components/ui/Button";
import { useAuth } from "../../lib/auth";

type Mode = "signin" | "signup";

export default function Login() {
  const { signInWithEmail, signUpWithEmail } = useAuth();
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async () => {
    setLoading(true);
    setErr(null);
    const res = mode === "signin"
      ? await signInWithEmail(email, password)
      : await signUpWithEmail(email, password, phone);
    setLoading(false);
    if (res.error) {
      setErr(res.error);
      return;
    }
    router.replace("/");
  };

  const isSignup = mode === "signup";

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

        {/* Tab-toggle */}
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

        <View className="gap-4 max-w-md w-full self-center">
          <View>
            <Text className="text-bone-400 mb-2 uppercase tracking-widest text-xs">E-post</Text>
            <TextInput
              value={email}
              onChangeText={setEmail}
              placeholder="navn@epost.no"
              placeholderTextColor="#5A574E"
              autoCapitalize="none"
              autoComplete="email"
              autoCorrect={false}
              keyboardType="email-address"
              textContentType="emailAddress"
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
              onSubmitEditing={isSignup ? undefined : submit}
              className="bg-ink-800 border border-ink-600 rounded-md px-4 py-3 text-bone-100"
            />
          </View>

          {isSignup && (
            <View>
              <Text className="text-bone-400 mb-2 uppercase tracking-widest text-xs">
                Telefon <Text className="text-bone-500 normal-case tracking-normal">(valgfritt)</Text>
              </Text>
              <TextInput
                value={phone}
                onChangeText={setPhone}
                placeholder="98 76 54 32"
                placeholderTextColor="#5A574E"
                autoCapitalize="none"
                autoComplete="tel"
                keyboardType="phone-pad"
                textContentType="telephoneNumber"
                onSubmitEditing={submit}
                className="bg-ink-800 border border-ink-600 rounded-md px-4 py-3 text-bone-100"
              />
              <Text className="text-bone-500 text-xs mt-2">
                Brukes kun til varsler ved hentevindu og refusjoner. Du kan legge til
                eller endre dette senere fra konto-siden.
              </Text>
            </View>
          )}

          {err ? <Text className="text-danger text-sm">{err}</Text> : null}

          <Button onPress={submit} loading={loading} fullWidth>
            {isSignup ? "Opprett konto" : "Logg inn"}
          </Button>

          <Text className="text-bone-500 text-xs text-center mt-2">
            Ved å {isSignup ? "opprette konto" : "logge inn"} godtar du vår{" "}
            <Text className="text-gold">personvernerklæring</Text> og{" "}
            <Text className="text-gold">vilkårene</Text>.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}
