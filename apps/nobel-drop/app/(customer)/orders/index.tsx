import { ScrollView, Text, View, Pressable } from "react-native";
import { Link } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { api } from "../../../lib/api";
import { Card, CardBody } from "../../../components/ui/Card";
import { formatNok, formatDate } from "../../../lib/format";

const STATUS_LABEL: Record<string, string> = {
  reserved: "Reservert (avventer betaling)",
  paid: "Betalt",
  confirmed: "Bekreftet",
  picked_up: "Hentet",
  refunded: "Refundert",
  cancelled: "Avbrutt",
};

export default function MyOrders() {
  const { data: orders } = useQuery({ queryKey: ["orders", "mine"], queryFn: api.orders.mine });

  return (
    <ScrollView className="bg-ink-900" contentContainerStyle={{ padding: 16 }}>
      {orders?.length === 0 ? (
        <Text className="text-bone-400 text-center mt-12">Ingen ordrer ennå.</Text>
      ) : (
        orders?.map((o) => (
          <Link key={o.id} href={`/orders/${o.id}`} asChild>
            <Pressable>
              <Card className="mb-3">
                <CardBody>
                  <View className="flex-row justify-between mb-2">
                    <Text className="text-bone-400 text-xs">{formatDate(o.created_at)}</Text>
                    <Text className="text-gold uppercase tracking-widest text-xs">
                      {STATUS_LABEL[o.status] ?? o.status}
                    </Text>
                  </View>
                  <Text className="text-bone-100 font-sans-medium mb-1">
                    {o.order_items?.[0]?.products?.name ?? "Ordre"}
                    {o.order_items && o.order_items.length > 1 ? ` +${o.order_items.length - 1}` : ""}
                  </Text>
                  <Text className="text-gold-bright font-display text-lg">
                    {formatNok(o.total_ore)}
                  </Text>
                </CardBody>
              </Card>
            </Pressable>
          </Link>
        ))
      )}
    </ScrollView>
  );
}
