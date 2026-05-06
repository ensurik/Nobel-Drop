import { ScrollView, View, Text, Switch, Platform } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { Stack, router } from "expo-router";
import { api } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { supabase } from "../../lib/supabase";
import { Card, CardBody } from "../../components/ui/Card";
import { Button } from "../../components/ui/Button";
import { formatNok, formatDate } from "../../lib/format";

export default function Account() {
  const { user, profile, signOut } = useAuth();
  const { data: balance } = useQuery({ queryKey: ["credits", "balance"], queryFn: api.credits.balance, initialData: 0 });
  const { data: history } = useQuery({ queryKey: ["credits", "history"], queryFn: api.credits.history });

  const togglePush = async (val: boolean) => {
    if (!user) return;
    await supabase.from("profiles").update({ push_enabled: val }).eq("id", user.id);
    if (val && Platform.OS === "web") {
      // web push subscription logic — se CURSOR.md prompt #6
      try {
        if ("serviceWorker" in navigator && "PushManager" in window) {
          const reg = await navigator.serviceWorker.register("/sw.js");
          const sub = await reg.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: process.env.EXPO_PUBLIC_VAPID_PUBLIC_KEY!,
          });
          const json = sub.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } };
          await supabase.from("push_subscriptions").upsert({
            user_id: user.id,
            platform: "web",
            endpoint: json.endpoint,
            p256dh: json.keys.p256dh,
            auth: json.keys.auth,
          });
        }
      } catch (e) {
        console.warn("push subscribe failed", e);
      }
    }
  };

  return (
    <ScrollView className="bg-ink-900" contentContainerStyle={{ padding: 16 }}>
      <Stack.Screen options={{ title: "Konto" }} />

      <Card className="mb-4">
        <CardBody>
          <Text className="text-bone-400 uppercase tracking-widest text-xs mb-1">Hei</Text>
          <Text className="font-display text-2xl text-bone-100">
            {profile?.full_name ?? user?.email}
          </Text>
        </CardBody>
      </Card>

      <Card className="mb-4">
        <CardBody>
          <Text className="text-bone-400 uppercase tracking-widest text-xs">Nobel-kreditt</Text>
          <Text className="text-gold-bright font-display text-3xl mt-1">{formatNok(balance ?? 0)}</Text>
          <Text className="text-bone-400 text-xs mt-2">
            Brukes som betaling i din neste ordre.
          </Text>
          {history && history.length > 0 && (
            <View className="mt-4 gap-2">
              {history.slice(0, 5).map((h: any) => (
                <View key={h.id} className="flex-row justify-between">
                  <Text className="text-bone-400 text-xs flex-1">
                    {formatDate(h.created_at)} · {h.note ?? h.type}
                  </Text>
                  <Text
                    className={`tabular-nums text-xs ${
                      h.amount_ore > 0 ? "text-success" : "text-bone-100"
                    }`}
                  >
                    {h.amount_ore > 0 ? "+" : ""}
                    {formatNok(h.amount_ore)}
                  </Text>
                </View>
              ))}
            </View>
          )}
        </CardBody>
      </Card>

      <Card className="mb-4">
        <CardBody>
          <View className="flex-row justify-between items-center">
            <View>
              <Text className="text-bone-100 font-sans-medium">Push-varsler</Text>
              <Text className="text-bone-400 text-xs">Bli varslet når et drop går live.</Text>
            </View>
            <Switch
              value={!!profile?.push_enabled}
              onValueChange={togglePush}
              trackColor={{ false: "#2A2A33", true: "#C8A24C" }}
            />
          </View>
        </CardBody>
      </Card>

      <Button variant="ghost" onPress={async () => { await signOut(); router.replace("/auth/login"); }}>
        Logg ut
      </Button>
    </ScrollView>
  );
}
