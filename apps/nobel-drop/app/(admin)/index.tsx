import { ScrollView, View, Text, Pressable } from "react-native";
import { Link, Stack } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "../../lib/supabase";
import { Card, CardBody } from "../../components/ui/Card";

export default function AdminHome() {
  const { data: stats } = useQuery({
    queryKey: ["admin", "stats"],
    queryFn: async () => {
      const [drops, orders, today] = await Promise.all([
        supabase.from("drops").select("id, status, units_sold, total_units"),
        supabase.from("orders").select("id, status, total_ore"),
        supabase
          .from("orders")
          .select("total_ore")
          .gte("created_at", new Date(new Date().setHours(0, 0, 0, 0)).toISOString())
          .eq("status", "paid"),
      ]);
      return {
        drops: drops.data ?? [],
        orders: orders.data ?? [],
        revenueToday:
          (today.data ?? []).reduce((s: number, o: { total_ore?: number }) => s + (o.total_ore ?? 0), 0) / 100,
      };
    },
  });

  const liveDrops = stats?.drops.filter((d: any) => d.status === "live").length ?? 0;
  const paidOrders = stats?.orders.filter((o: any) => o.status === "paid").length ?? 0;

  return (
    <ScrollView className="bg-ink-900" contentContainerStyle={{ padding: 16 }}>
      <Stack.Screen options={{ title: "Admin" }} />
      <View className="flex-row gap-3 mb-4">
        <Card className="flex-1">
          <CardBody>
            <Text className="text-bone-400 text-xs uppercase tracking-widest">Live drops</Text>
            <Text className="font-display text-3xl text-gold-bright">{liveDrops}</Text>
          </CardBody>
        </Card>
        <Card className="flex-1">
          <CardBody>
            <Text className="text-bone-400 text-xs uppercase tracking-widest">Betalte ordrer</Text>
            <Text className="font-display text-3xl text-gold-bright">{paidOrders}</Text>
          </CardBody>
        </Card>
      </View>

      <Card className="mb-4">
        <CardBody>
          <Text className="text-bone-400 text-xs uppercase tracking-widest">Inntekt i dag</Text>
          <Text className="font-display text-3xl text-gold-bright">
            {Intl.NumberFormat("nb-NO", { style: "currency", currency: "NOK", maximumFractionDigits: 0 }).format(
              stats?.revenueToday ?? 0,
            )}
          </Text>
        </CardBody>
      </Card>

      <View className="gap-3">
        <NavCard href="/(admin)/drops" title="Drops" subtitle="Lag og styr drop-runder" />
        <NavCard href="/(admin)/orders" title="Ordrer" subtitle="Alle ordrer og status" />
        <NavCard href="/(admin)/windows" title="Pickup-vinduer" subtitle="Volum + refunds" />
        <NavCard href="/(admin)/nodes" title="Pickup-noder" subtitle="Lokasjoner og partnere" />
      </View>
    </ScrollView>
  );
}

function NavCard({ href, title, subtitle }: { href: string; title: string; subtitle: string }) {
  return (
    <Link href={href} asChild>
      <Pressable>
        <Card>
          <CardBody>
            <Text className="text-bone-100 font-sans-medium">{title}</Text>
            <Text className="text-bone-400 text-sm mt-0.5">{subtitle}</Text>
          </CardBody>
        </Card>
      </Pressable>
    </Link>
  );
}
