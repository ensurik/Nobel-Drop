import { ScrollView, View, Text, Pressable } from "react-native";
import { Link, Stack } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "../../../lib/supabase";
import { Card, CardBody } from "../../../components/ui/Card";
import { Button } from "../../../components/ui/Button";
import { formatDate } from "../../../lib/format";

export default function AdminDrops() {
  const { data: drops } = useQuery({
    queryKey: ["admin", "drops"],
    queryFn: async () => {
      const { data } = await supabase
        .from("drops")
        .select("*")
        .order("starts_at", { ascending: false });
      return data ?? [];
    },
  });

  return (
    <ScrollView className="bg-ink-900" contentContainerStyle={{ padding: 16 }}>
      <Stack.Screen
        options={{
          title: "Drops",
          headerRight: () => (
            <Link href="/(admin)/drops/new" asChild>
              <Pressable className="px-3 py-1 bg-gold rounded">
                <Text className="text-ink-900 text-xs font-sans-bold uppercase tracking-widest">
                  Ny
                </Text>
              </Pressable>
            </Link>
          ),
        }}
      />
      {drops?.map((d: any) => (
        <Link key={d.id} href={`/(admin)/drops/${d.id}`} asChild>
          <Pressable>
            <Card className="mb-3">
              <CardBody>
                <View className="flex-row justify-between mb-2">
                  <Text className="text-bone-400 text-xs uppercase tracking-widest">
                    {formatDate(d.starts_at)} → {formatDate(d.ends_at)}
                  </Text>
                  <Text className="text-gold text-xs uppercase tracking-widest">{d.status}</Text>
                </View>
                <Text className="font-display text-xl text-bone-100">{d.name}</Text>
                <Text className="text-bone-400 text-sm mt-1">
                  {d.units_sold}/{d.total_units} solgt
                </Text>
              </CardBody>
            </Card>
          </Pressable>
        </Link>
      ))}
    </ScrollView>
  );
}
