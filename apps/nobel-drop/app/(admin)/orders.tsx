import { ScrollView, View, Text } from "react-native";
import { Stack } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "../../lib/supabase";
import { Card, CardBody } from "../../components/ui/Card";
import { formatNok, formatDate, formatTime } from "../../lib/format";

export default function AdminOrders() {
  const { data: orders } = useQuery({
    queryKey: ["admin", "orders"],
    queryFn: async () => {
      const { data } = await supabase
        .from("orders")
        .select("*, profiles(full_name, email), pickup_windows(pickup_nodes(name))")
        .order("created_at", { ascending: false })
        .limit(100);
      return data ?? [];
    },
  });

  return (
    <ScrollView className="bg-ink-900" contentContainerStyle={{ padding: 16 }}>
      <Stack.Screen options={{ title: "Ordrer" }} />
      {orders?.map((o: any) => (
        <Card key={o.id} className="mb-3">
          <CardBody>
            <View className="flex-row justify-between mb-1">
              <Text className="text-bone-400 text-xs">
                {formatDate(o.created_at)} {formatTime(o.created_at)}
              </Text>
              <Text className="text-gold text-xs uppercase tracking-widest">{o.status}</Text>
            </View>
            <Text className="text-bone-100 font-sans-medium">
              {o.profiles?.full_name ?? o.profiles?.email}
            </Text>
            <Text className="text-bone-400 text-xs mt-0.5">
              {o.pickup_windows?.pickup_nodes?.name ?? "—"}
            </Text>
            <Text className="text-gold-bright mt-2">{formatNok(o.total_ore)}</Text>
          </CardBody>
        </Card>
      ))}
    </ScrollView>
  );
}
