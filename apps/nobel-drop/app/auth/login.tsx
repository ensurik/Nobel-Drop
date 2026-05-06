import { useState } from "react";
import { View, Text, TextInput, Image, ScrollView } from "react-native";
import { Stack } from "expo-router";
import { Button } from "../../components/ui/Button";
import { useAuth } from "../../lib/auth";

export default function Login() {
  const { signInWithEmail } = useAuth();
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async () => {
    setLoading(true);
    setErr(null);
    const { error } = await signInWithEmail(email);
    setLoading(false);
    if (error) setErr(error);
    else setSent(true);
  };

  return (
    <View className="flex-1 bg-ink-900">
      <Stack.Screen options={{ headerShown: false }} />
      <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: "center", padding: 24 }}>
        <View className="items-center mb-10">
          <Text className="font-display text-5xl text-gold tracking-wide">Nobel Drop</Text>
          <Text className="text-bone-400 mt-2">En ny standard for premium D2C.</Text>
        </View>

        {sent ? (
          <View className="bg-ink-800 border border-gold-deep rounded-lg p-6">
            <Text className="text-bone-100 text-center text-lg font-display">
              Sjekk eposten din
            </Text>
            <Text className="text-bone-400 text-center mt-2">
              Vi sendte en magisk lenke til {email}.
            </Text>
          </View>
        ) : (
          <View className="gap-4">
            <View>
              <Text className="text-bone-400 mb-2 uppercase tracking-widest text-xs">Epost</Text>
              <TextInput
                value={email}
                onChangeText={setEmail}
                placeholder="navn@eksempel.no"
                placeholderTextColor="#5A574E"
                autoCapitalize="none"
                keyboardType="email-address"
                className="bg-ink-800 border border-ink-600 rounded-md px-4 py-3 text-bone-100"
              />
            </View>
            {err ? <Text className="text-danger">{err}</Text> : null}
            <Button onPress={submit} loading={loading} fullWidth>
              Send magisk lenke
            </Button>
          </View>
        )}
      </ScrollView>
    </View>
  );
}
