import { ScrollView, View, Text } from "react-native";
import { Stack } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "../../lib/supabase";
import { Card, CardBody } from "../../components/ui/Card";

export default function AdminNodes() {
  const { data } = useQuery({
    queryKey: ["admin", "nodes"],
    queryFn: async () => {
      const { data } = await supabase
        .from("pickup_nodes")
        .select("*")
        .order("city");
      return data ?? [];
    },
  });

  return (
    <ScrollView className="bg-ink-900" contentContainerStyle={{ padding: 16 }}>
      <Stack.Screen options={{ title: "Pickup-noder" }} />
      {data?.map((n: any) => (
        <Card key={n.id} className="mb-3">
          <CardBody>
            <View className="flex-row justify-between mb-1">
              <Text className="text-bone-400 text-xs uppercase tracking-widest">{n.type}</Text>
              <Text className={`text-xs ${n.is_active ? "text-success" : "text-bone-400"}`}>
                {n.is_active ? "aktiv" : "inaktiv"}
              </Text>
            </View>
            <Text className="text-bone-100 font-sans-medium">{n.name}</Text>
            {n.address && <Text className="text-bone-400 text-sm">{n.address}</Text>}
          </CardBody>
        </Card>
      ))}
    </ScrollView>
  );
}
