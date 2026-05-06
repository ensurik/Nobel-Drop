import { ScrollView, View, Text } from "react-native";
import { Stack, useLocalSearchParams } from "expo-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../../../lib/supabase";
import { Card, CardBody } from "../../../components/ui/Card";
import { Button } from "../../../components/ui/Button";
import { formatDate, formatTime, formatNok } from "../../../lib/format";

export default function AdminDropDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const qc = useQueryClient();

  const { data: drop } = useQuery({
    queryKey: ["admin", "drop", id],
    queryFn: async () => {
      const { data } = await supabase
        .from("drops")
        .select("*, drop_items(*, products(name)), pickup_windows(*, pickup_nodes(*), orders(id, status))")
        .eq("id", id!)
        .single();
      return data;
    },
    enabled: !!id,
  });

  const goLive = useMutation({
    mutationFn: async () => {
      await supabase.from("drops").update({ status: "live" }).eq("id", id!);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "drop", id] }),
  });

  const sendNotification = useMutation({
    mutationFn: async () => {
      await supabase.functions.invoke("send-drop-notification", { body: { drop_id: id } });
    },
  });

  if (!drop) return null;

  return (
    <ScrollView className="bg-ink-900" contentContainerStyle={{ padding: 16 }}>
      <Stack.Screen options={{ title: drop.name }} />

      <Card className="mb-4">
        <CardBody>
          <Text className="text-bone-400 text-xs uppercase tracking-widest">Status</Text>
          <Text className="font-display text-2xl text-gold-bright">{drop.status}</Text>
          <Text className="text-bone-400 text-xs mt-3">
            {formatDate(drop.starts_at)} {formatTime(drop.starts_at)} → {formatTime(drop.ends_at)}
          </Text>
          <Text className="text-bone-100 mt-2">
            {drop.units_sold}/{drop.total_units} solgt
          </Text>
        </CardBody>
      </Card>

      <View className="flex-row gap-2 mb-4">
        {drop.status !== "live" && (
          <Button onPress={() => goLive.mutate()} loading={goLive.isPending}>
            Gå live
          </Button>
        )}
        <Button variant="secondary" onPress={() => sendNotification.mutate()} loading={sendNotification.isPending}>
          Send push
        </Button>
      </View>

      <Text className="text-bone-400 uppercase tracking-widest text-xs mb-2">Produkter i drop</Text>
      <View className="gap-2 mb-6">
        {drop.drop_items?.map((di: any) => (
          <Card key={di.id}>
            <CardBody>
              <View className="flex-row justify-between">
                <View className="flex-1">
                  <Text className="text-bone-100 font-sans-medium">{di.products?.name}</Text>
                  <Text className="text-bone-400 text-xs">{di.role}</Text>
                </View>
                <View className="items-end">
                  <Text className="text-gold-bright">{formatNok(di.price_ore)}</Text>
                  <Text className="text-bone-400 text-xs">
                    {di.sold_units}/{di.available_units}
                  </Text>
                </View>
              </View>
            </CardBody>
          </Card>
        ))}
      </View>

      <Text className="text-bone-400 uppercase tracking-widest text-xs mb-2">Pickup-vinduer</Text>
      <View className="gap-2">
        {drop.pickup_windows?.map((w: any) => {
          const paid = w.orders?.filter((o: any) => o.status === "paid" || o.status === "confirmed").length ?? 0;
          const reached = paid >= w.min_volume_required;
          return (
            <Card key={w.id}>
              <CardBody>
                <View className="flex-row justify-between">
                  <View>
                    <Text className="text-bone-100 font-sans-medium">{w.pickup_nodes.name}</Text>
                    <Text className="text-bone-400 text-xs mt-0.5">
                      {formatTime(w.starts_at)}–{formatTime(w.ends_at)}
                    </Text>
                  </View>
                  <View className="items-end">
                    <Text className={`text-sm ${reached ? "text-success" : "text-danger"}`}>
                      {paid}/{w.min_volume_required} ordre
                    </Text>
                    <Text className="text-bone-400 text-xs uppercase tracking-widest">
                      {w.status}
                    </Text>
                  </View>
                </View>
              </CardBody>
            </Card>
          );
        })}
      </View>
    </ScrollView>
  );
}
