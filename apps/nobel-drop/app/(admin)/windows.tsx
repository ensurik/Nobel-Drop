import { ScrollView, View, Text } from "react-native";
import { Stack } from "expo-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../../lib/supabase";
import { Card, CardBody } from "../../components/ui/Card";
import { Button } from "../../components/ui/Button";
import { formatDate, formatTime } from "../../lib/format";

export default function AdminWindows() {
  const qc = useQueryClient();

  const { data } = useQuery({
    queryKey: ["admin", "windows"],
    queryFn: async () => {
      const { data } = await supabase
        .from("pickup_windows")
        .select("*, pickup_nodes(name), orders(id, status), drops(name, status)")
        .order("starts_at");
      return data ?? [];
    },
  });

  const evaluate = useMutation({
    mutationFn: async () => {
      await supabase.functions.invoke("evaluate-pickup-windows", { body: {} });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "windows"] }),
  });

  return (
    <ScrollView className="bg-ink-900" contentContainerStyle={{ padding: 16 }}>
      <Stack.Screen options={{ title: "Pickup-vinduer" }} />
      <View className="mb-4">
        <Button onPress={() => evaluate.mutate()} loading={evaluate.isPending} variant="secondary">
          Evaluer cutoff (refunder under min)
        </Button>
      </View>

      {data?.map((w: any) => {
        const paid = w.orders?.filter((o: any) => ["paid", "confirmed"].includes(o.status)).length ?? 0;
        const reached = paid >= w.min_volume_required;
        return (
          <Card key={w.id} className="mb-3">
            <CardBody>
              <View className="flex-row justify-between mb-1">
                <Text className="text-bone-400 text-xs">
                  {formatDate(w.starts_at)} · {formatTime(w.starts_at)}–{formatTime(w.ends_at)}
                </Text>
                <Text className={`text-xs uppercase tracking-widest ${reached ? "text-success" : "text-danger"}`}>
                  {w.status}
                </Text>
              </View>
              <Text className="text-bone-100 font-sans-medium">
                {w.pickup_nodes.name} — {w.drops.name}
              </Text>
              <View className="mt-2 h-2 rounded-full bg-ink-700 overflow-hidden">
                <View
                  className={`h-full ${reached ? "bg-success" : "bg-gold"}`}
                  style={{ width: `${Math.min(100, (paid / Math.max(1, w.min_volume_required)) * 100)}%` }}
                />
              </View>
              <Text className="text-bone-400 text-xs mt-1">
                {paid}/{w.min_volume_required} betalte ordrer
              </Text>
            </CardBody>
          </Card>
        );
      })}
    </ScrollView>
  );
}
