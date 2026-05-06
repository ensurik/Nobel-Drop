import { ScrollView, View, Text, Pressable } from "react-native";
import { Stack, Link } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../lib/auth";
import { Card, CardBody } from "../../components/ui/Card";
import { Button } from "../../components/ui/Button";
import { formatDate, formatTime } from "../../lib/format";

export default function PickupHome() {
  const { user, profile } = useAuth();

  const { data: windows } = useQuery({
    queryKey: ["pickup", "windows", user?.id],
    queryFn: async () => {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const tomorrow = new Date(today);
      tomorrow.setDate(today.getDate() + 1);

      let q = supabase
        .from("pickup_windows")
        .select("*, pickup_nodes(name, address), drops(name), orders(id, status)")
        .gte("starts_at", today.toISOString())
        .lt("starts_at", tomorrow.toISOString())
        .order("starts_at");

      if (profile?.role === "driver") q = q.eq("driver_id", user!.id);

      const { data } = await q;
      return data ?? [];
    },
    enabled: !!user,
  });

  return (
    <ScrollView className="bg-ink-900" contentContainerStyle={{ padding: 16 }}>
      <Stack.Screen options={{ title: "Pickup" }} />

      <View className="mb-4">
        <Link href="/(pickup)/scan" asChild>
          <Button size="lg" fullWidth>
            Skann pickup-QR
          </Button>
        </Link>
      </View>

      <Text className="text-bone-400 uppercase tracking-widest text-xs mb-2">Dagens vinduer</Text>

      {windows?.length === 0 && (
        <Text className="text-bone-400 text-center mt-8">Ingen vinduer i dag.</Text>
      )}

      {windows?.map((w: any) => {
        const total = w.orders?.length ?? 0;
        const collected = w.orders?.filter((o: any) => o.status === "picked_up").length ?? 0;
        return (
          <Card key={w.id} className="mb-3">
            <CardBody>
              <Text className="text-bone-400 text-xs uppercase tracking-widest">
                {w.drops?.name}
              </Text>
              <Text className="text-bone-100 font-sans-medium mt-1">{w.pickup_nodes.name}</Text>
              <Text className="text-bone-400 text-sm">{w.pickup_nodes.address}</Text>
              <View className="flex-row justify-between mt-3">
                <Text className="text-bone-400 text-sm">
                  {formatDate(w.starts_at)} · {formatTime(w.starts_at)}–{formatTime(w.ends_at)}
                </Text>
                <Text className="text-gold-bright text-sm">
                  {collected}/{total} hentet
                </Text>
              </View>
            </CardBody>
          </Card>
        );
      })}
    </ScrollView>
  );
}
